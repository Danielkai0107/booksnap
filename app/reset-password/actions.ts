"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState = {
  /** 表單驗證 / Supabase 回傳的錯誤訊息（用 toast 顯示） */
  error?: string;
};

/**
 * Two entry modes share this action:
 *
 * 1. **Link mode** — `/auth/callback` already did `exchangeCodeForSession`
 *    when the recipient clicked the email link. The form only carries the
 *    new password fields; we just call `updateUser({ password })`.
 *
 * 2. **OTP fallback mode** — when the email link was prefetched (e.g.
 *    Microsoft Defender Safe Links) the token gets consumed silently.
 *    The form then carries `email` + `token` (the 6-digit OTP) and we
 *    call `verifyOtp({ type:'recovery' })` first to obtain a session,
 *    before `updateUser`.
 *
 * In both modes we sign the user out at the end so they have to log in
 * again with the new password — this re-runs the org status checks in
 * `loginAction` that are bypassed for an already-authenticated session.
 */
async function resetPassword(
  formData: FormData,
  loginPath: string,
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

  const otpToken = String(formData.get("token") ?? "").trim();
  const otpEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  if (otpToken) {
    if (!/^\d{6}$/.test(otpToken)) {
      return { error: "驗證碼必須是 6 位數字" };
    }
    if (!otpEmail) {
      return { error: "請輸入註冊用的 Email" };
    }
    const { error } = await supabase.auth.verifyOtp({
      email: otpEmail,
      token: otpToken,
      type: "recovery",
    });
    if (error) {
      return { error: "驗證碼錯誤或已過期，請重新申請" };
    }
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "驗證已逾期，請重新申請密碼重設" };
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
  return resetPassword(formData, "/login");
}

export async function superAdminResetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  return resetPassword(formData, "/super-admin/login");
}
