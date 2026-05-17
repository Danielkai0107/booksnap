"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState = {
  /** 表單驗證 / Supabase 回傳的錯誤訊息（用 toast 顯示） */
  error?: string;
};

/**
 * Sets a new password after the user has a recovery session — either from
 * clicking the email link (`/auth/callback` → here) or from verifying the
 * OTP on `/reset-password/verify` first.
 */
async function resetPassword(
  formData: FormData,
  loginPath: string,
  verifyPath: string,
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("passwordConfirm") ?? "");
  if (password.length < 8) {
    return { error: "密碼至少 8 個字元" };
  }
  if (password !== confirm) {
    return { error: "兩次輸入的密碼不一致" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect(verifyPath);
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password });
  if (updateErr) {
    return { error: updateErr.message };
  }

  await supabase.auth.signOut();
  redirect(`${loginPath}?status=password_reset`);
}

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  return resetPassword(formData, "/login", "/reset-password/verify");
}

export async function superAdminResetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  return resetPassword(
    formData,
    "/super-admin/login",
    "/super-admin/reset-password/verify",
  );
}
