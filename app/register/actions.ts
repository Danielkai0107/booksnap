"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateUniqueOrgSlug } from "@/lib/slug";
import { isTwCity } from "@/lib/cities";
import { toUserMessage } from "@/lib/errors/user-message";
import type { RegisterState, RegisterValues } from "./types";

/**
 * Stage 1 — collect the form, ask Supabase to send a 6-digit confirmation
 * OTP, and stash the org metadata (city/name/phone) inside `user_metadata`
 * so we can read it back from the verified user after stage 2.
 *
 * Why store in `user_metadata` rather than e.g. an `OrgRegistrations` table?
 * `signUp` is a single round-trip that already accepts arbitrary metadata,
 * and `user_metadata` survives across retries / resends without extra
 * bookkeeping. After verify we re-validate before turning it into a real
 * organization row, so an attacker who tampers with metadata locally can't
 * gain anything they don't already have.
 *
 * Note: `user_metadata` is user-editable and **must NOT** be relied on for
 * authorization. We only treat it as a holding cell for the registration
 * payload and re-validate everything server-side in stage 2. The actual
 * role (`role: "unit"`) is set in `app_metadata` by the admin client, which
 * is the trustworthy claim used by the proxy and RLS.
 */
export async function requestRegisterOtp(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const city = String(formData.get("city") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  const values: RegisterValues = { city, name, email, phone };

  if (!city || !isTwCity(city)) {
    return { stage: "form", error: "請選擇縣市", values };
  }
  if (!name) return { stage: "form", error: "請輸入單位名稱", values };
  if (!email) return { stage: "form", error: "請輸入 Email", values };
  if (!phone) return { stage: "form", error: "請輸入聯絡電話", values };
  if (password.length < 8) {
    return { stage: "form", error: "密碼至少 8 個字元", values };
  }
  if (password !== passwordConfirm) {
    return { stage: "form", error: "兩次輸入的密碼不一致", values };
  }

  const admin = createAdminClient();
  const { data: existingOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("contact_email", email)
    .maybeSingle();
  if (existingOrg) {
    return {
      stage: "form",
      error: "此 Email 已被註冊",
      values,
    };
  }

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { unit_name: name, city, phone },
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  });

  if (error) {
    if (/already (registered|exists)/i.test(error.message)) {
      return {
        stage: "form",
        error: "此 Email 已被註冊",
        values,
      };
    }
    return {
      stage: "form",
      error: toUserMessage(error, "無法寄送驗證信，請稍後再試"),
      values,
    };
  }

  // Supabase 防 email 枚舉：重複註冊時常不回 error，而是 user.identities 為空陣列。
  const identities = data.user?.identities ?? [];
  if (identities.length === 0) {
    return {
      stage: "form",
      error: "此 Email 已被註冊",
      values,
    };
  }

  return {
    stage: "verify",
    email,
    values: { city, name, email, phone },
  };
}

/**
 * Stage 2 — verify the 6-digit OTP, then promote the auth user into a real
 * unit owner: set `app_metadata.role`, create the organization, and the
 * profile row. On any DB failure we delete the auth user so the user can
 * retry registration cleanly.
 *
 * The verifyOtp call also creates a fresh session for the user (cookies
 * are set by the server client), so on `redirect("/")` they land already
 * logged in.
 */
export async function verifyRegisterOtp(
  prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  if (prev.stage !== "verify") {
    return { stage: "form", error: "請先完成第一步驟" };
  }

  const token = String(formData.get("token") ?? "").trim();
  const email = prev.email;

  // Email OTP length is configurable in Supabase (6–10 digits); accept the
  // whole range so the operator can change the setting without a deploy.
  if (!/^\d{6,10}$/.test(token)) {
    return {
      stage: "verify",
      email,
      values: prev.values,
      error: "請輸入信中的數字驗證碼",
    };
  }

  const supabase = await createClient();
  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (verifyError || !verifyData.user) {
    return {
      stage: "verify",
      email,
      values: prev.values,
      error: "驗證碼錯誤或已過期，請重新寄送",
    };
  }

  const user = verifyData.user;
  const admin = createAdminClient();

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existingProfile) {
    redirect("/login?error=already_registered");
  }

  const meta = (user.user_metadata ?? {}) as {
    unit_name?: string;
    city?: string;
    phone?: string;
  };
  const unitName = (meta.unit_name ?? prev.values.name ?? "").trim();
  const city = (meta.city ?? prev.values.city ?? "").trim();
  const phone = (meta.phone ?? prev.values.phone ?? "").trim();

  if (!unitName || !city || !phone || !isTwCity(city)) {
    // Should never happen — the data was validated in stage 1 — but be
    // defensive so we don't insert a bogus organization row.
    return {
      stage: "verify",
      email,
      values: prev.values,
      error: "註冊資料遺失，請從第一步驟重新輸入",
    };
  }

  // Promote the auth user from anonymous → unit role. This must happen
  // before any organization-related routing is allowed.
  const { error: roleErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { role: "unit" },
  });
  if (roleErr) {
    return {
      stage: "verify",
      email,
      values: prev.values,
      error: toUserMessage(roleErr, "無法完成註冊，請稍後再試"),
    };
  }

  let publicSlug: string;
  try {
    publicSlug = await generateUniqueOrgSlug(unitName);
  } catch (err) {
    await admin.auth.admin.deleteUser(user.id);
    return {
      stage: "form",
      error: toUserMessage(err, "建立借還連結失敗"),
      values: prev.values,
    };
  }

  const nowIso = new Date().toISOString();
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: unitName,
      city,
      contact_email: email,
      contact_phone: phone,
      status: "approved",
      approved_at: nowIso,
      owner_user_id: user.id,
      public_slug: publicSlug,
    })
    .select("id")
    .single();
  if (orgErr || !org) {
    await admin.auth.admin.deleteUser(user.id);
    return {
      stage: "form",
      error: toUserMessage(orgErr, "建立單位資料失敗"),
      values: prev.values,
    };
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: user.id,
    organization_id: org.id,
    role: "unit",
  });
  if (profileErr) {
    await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(user.id);
    return {
      stage: "form",
      error: toUserMessage(profileErr, "建立單位資料失敗"),
      values: prev.values,
    };
  }

  redirect("/");
}

export type ResendRegisterOtpResult = {
  ok: boolean;
  error?: string;
};

/** Client-callable resend for the verify stage countdown button. */
export async function resendRegisterOtpByEmail(
  email: string,
): Promise<ResendRegisterOtpResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, error: "找不到 Email，請從第一步重新送出" };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: trimmed,
  });
  if (error) {
    console.error("[register] resend signup OTP failed", error);
    return { ok: false, error: "重新寄送失敗，請稍後再試" };
  }
  return { ok: true };
}

/**
 * Resend the signup confirmation email when the user clicks "重新寄送".
 * Returns a state object compatible with the form's `useActionState`, so
 * the UI can show an inline "已重寄" toast without changing stage.
 */
export async function resendRegisterOtp(
  prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  void formData;
  if (prev.stage !== "verify") {
    return prev;
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: prev.email,
  });
  if (error) {
    return {
      stage: "verify",
      email: prev.email,
      values: prev.values,
      error: "重新寄送失敗，請稍後再試",
    };
  }
  return {
    stage: "verify",
    email: prev.email,
    values: prev.values,
    info: "已重新寄送驗證信",
  };
}
