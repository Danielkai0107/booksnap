"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RecoveryVerifyState = {
  error?: string;
};

async function verifyRecoveryOtp(
  formData: FormData,
  resetPath: string,
  forgotPath: string,
): Promise<RecoveryVerifyState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim();

  if (!email) {
    redirect(forgotPath);
  }
  if (!/^\d{6,10}$/.test(token)) {
    return { error: "請輸入信中的數字驗證碼" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "recovery",
  });
  if (error) {
    return { error: "驗證碼錯誤或已過期，請重新寄送" };
  }

  redirect(resetPath);
}

export async function verifyRecoveryOtpAction(
  _prev: RecoveryVerifyState,
  formData: FormData,
): Promise<RecoveryVerifyState> {
  return verifyRecoveryOtp(formData, "/reset-password", "/forgot-password");
}

export async function superAdminVerifyRecoveryOtpAction(
  _prev: RecoveryVerifyState,
  formData: FormData,
): Promise<RecoveryVerifyState> {
  return verifyRecoveryOtp(
    formData,
    "/super-admin/reset-password",
    "/super-admin/forgot-password",
  );
}
