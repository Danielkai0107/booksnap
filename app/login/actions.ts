"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendLoginEmailOtp } from "@/lib/auth/login-otp";
import { validateUnitLoginUser } from "@/lib/auth/unit-login";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "請輸入 Email 與密碼" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { error: "帳號或密碼不正確" };
  }

  const role =
    (data.user.app_metadata?.role as "unit" | "super_admin" | undefined) ??
    null;

  // Super admin must log in via /super-admin/login
  if (role === "super_admin") {
    await supabase.auth.signOut();
    return { error: "此帳號為超級管理員，請改用 /super-admin 登入" };
  }

  const unitErr = await validateUnitLoginUser(data.user.id);
  if (unitErr) {
    await supabase.auth.signOut();
    return { error: unitErr };
  }

  await supabase.auth.signOut();

  const otpErr = await sendLoginEmailOtp(email);
  if (otpErr) {
    return { error: otpErr };
  }

  redirect(`/login/verify?email=${encodeURIComponent(email)}`);
}
