"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLoginEmailOtp } from "@/lib/auth/login-otp";
import { verifyPasswordWithoutSession } from "@/lib/auth/verify-password";

export type SaLoginState = {
  error?: string;
};

export async function superAdminLoginAction(
  _prev: SaLoginState,
  formData: FormData,
): Promise<SaLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "請輸入 Email 與密碼" };
  }

  const auth = await verifyPasswordWithoutSession(email, password);
  if (!auth.ok) {
    return { error: "帳號或密碼不正確" };
  }

  const admin = createAdminClient();
  const { data: userData } = await admin.auth.admin.getUserById(auth.userId);
  const user = userData.user;
  if (!user) {
    return { error: "帳號或密碼不正確" };
  }

  const role =
    (user.app_metadata?.role as "unit" | "super_admin" | undefined) ?? null;

  if (role !== "super_admin") {
    return { error: "此帳號沒有超級管理員權限" };
  }

  const otpErr = await sendLoginEmailOtp(email);
  if (otpErr) {
    return { error: otpErr };
  }

  redirect(`/super-admin/login/verify?email=${encodeURIComponent(email)}`);
}
