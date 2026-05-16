"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateUniqueOrgSlug } from "@/lib/slug";
import { isTwCity } from "@/lib/cities";
import type { RegisterState } from "./types";

export async function registerAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const city = String(formData.get("city") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  const values = { city, name, email, phone };

  if (!city || !isTwCity(city)) {
    return { error: "請選擇縣市", values };
  }
  if (!name) return { error: "請輸入單位名稱", values };
  if (!email) return { error: "請輸入 Email", values };
  if (!phone) return { error: "請輸入聯絡電話", values };
  if (password.length < 8) {
    return { error: "密碼至少 8 個字元", values };
  }
  if (password !== passwordConfirm) {
    return { error: "兩次輸入的密碼不一致", values };
  }

  const admin = createAdminClient();

  // 1. Create auth user
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { unit_name: name },
    app_metadata: { role: "unit" },
  });
  if (userError || !userData.user) {
    const msg = userError?.message ?? "建立帳號失敗";
    return {
      error: /already (registered|exists)/i.test(msg)
        ? "此 Email 已被註冊"
        : msg,
      values,
    };
  }

  const userId = userData.user.id;

  // 2. Create organization (auto-approved) with a public_slug we can hand out as
  //    `/o/{slug}`. v1 PLG flow: no human approval — units can use the system
  //    immediately. Super admin can still later suspend or downgrade plans.
  let publicSlug: string;
  try {
    publicSlug = await generateUniqueOrgSlug(name);
  } catch (err) {
    await admin.auth.admin.deleteUser(userId);
    return {
      error: err instanceof Error ? err.message : "建立借還連結失敗",
      values,
    };
  }

  const nowIso = new Date().toISOString();
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name,
      city,
      contact_email: email,
      contact_phone: phone,
      status: "approved",
      approved_at: nowIso,
      owner_user_id: userId,
      public_slug: publicSlug,
    })
    .select("id")
    .single();
  if (orgError || !org) {
    // Cleanup the dangling user so register can be retried
    await admin.auth.admin.deleteUser(userId);
    return { error: orgError?.message ?? "建立單位資料失敗", values };
  }

  // 3. Create profile
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    organization_id: org.id,
    role: "unit",
  });
  if (profileError) {
    await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(userId);
    return { error: profileError.message, values };
  }

  // 4. Sign the new user in so they land on the admin home immediately. If sign-in
  //    fails for any reason (shouldn't, we just created them), fall back to
  //    the login page so they can manually log in.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    redirect("/login?registered=1");
  }

  redirect("/");
}
