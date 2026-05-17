"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLoginEmailOtp } from "@/lib/auth/login-otp";
import { validateUnitLoginUser } from "@/lib/auth/unit-login";
import { verifyPasswordWithoutSession } from "@/lib/auth/verify-password";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
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

  if (role === "super_admin") {
    return { error: "此帳號為超級管理員，請改用 /super-admin 登入" };
  }

  const unitErr = await validateUnitLoginUser(user.id);
  if (unitErr) {
    return { error: unitErr };
  }

  const otpErr = await sendLoginEmailOtp(email);
  if (otpErr) {
    return { error: otpErr };
  }

  redirect(`/login/verify?email=${encodeURIComponent(email)}`);
}
