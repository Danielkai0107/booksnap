"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateUnitLoginUser } from "@/lib/auth/unit-login";
import { sendLoginEmailOtp } from "@/lib/auth/login-otp";

export type LoginVerifyState = {
  error?: string;
};

export type ResendLoginOtpResult = {
  ok: boolean;
  error?: string;
};

async function verifyLoginEmailOtp(
  formData: FormData,
  defaultNext: string,
  loginPath: string,
  variant: "unit" | "super",
): Promise<LoginVerifyState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim();

  if (!email) {
    redirect(loginPath);
  }
  if (!/^\d{6,10}$/.test(token)) {
    return { error: "請輸入信中的數字驗證碼" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error || !data.user) {
    return { error: "驗證碼錯誤或已過期，請重新寄送" };
  }

  if (variant === "super") {
    const role =
      (data.user.app_metadata?.role as "unit" | "super_admin" | undefined) ??
      null;
    if (role !== "super_admin") {
      await supabase.auth.signOut();
      return { error: "此帳號沒有超級管理員權限" };
    }
  } else {
    const unitErr = await validateUnitLoginUser(data.user.id);
    if (unitErr) {
      await supabase.auth.signOut();
      return { error: unitErr };
    }
  }

  const rawNext = String(formData.get("next") ?? "");
  const next = rawNext.startsWith("/") ? rawNext : defaultNext;
  redirect(next);
}

export async function verifyLoginOtpAction(
  _prev: LoginVerifyState,
  formData: FormData,
): Promise<LoginVerifyState> {
  return verifyLoginEmailOtp(formData, "/", "/login", "unit");
}

export async function superAdminVerifyLoginOtpAction(
  _prev: LoginVerifyState,
  formData: FormData,
): Promise<LoginVerifyState> {
  return verifyLoginEmailOtp(
    formData,
    "/super-admin",
    "/super-admin/login",
    "super",
  );
}

export async function resendLoginOtpByEmail(
  email: string,
): Promise<ResendLoginOtpResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, error: "找不到 Email，請從登入頁重新操作" };
  }
  const err = await sendLoginEmailOtp(trimmed);
  if (err) return { ok: false, error: err };
  return { ok: true };
}
