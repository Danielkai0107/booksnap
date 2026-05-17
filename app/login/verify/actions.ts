"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginVerifyState = {
  error?: string;
};

/**
 * Final step of the password + TOTP login. The user already has an AAL1
 * session from `signInWithPassword`; verifying their authenticator code
 * upgrades the session to AAL2, which is what gated routes look for.
 *
 * `next` is pulled from a hidden form field so we can land back on the
 * page the user originally tried to visit. We sanity-check it to a
 * same-origin path to prevent open redirects.
 */
async function verifyLoginMfa(
  formData: FormData,
  defaultNext: string,
): Promise<LoginVerifyState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { error: "請輸入 6 碼數字驗證碼" };
  }

  const supabase = await createClient();
  const { data: factorsData, error: factorsErr } =
    await supabase.auth.mfa.listFactors();
  if (factorsErr) {
    return { error: factorsErr.message };
  }
  const totpFactor = factorsData?.totp?.[0];
  if (!totpFactor) {
    return { error: "找不到雙重驗證設定，請重新登入" };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: totpFactor.id,
    code,
  });
  if (error) {
    return { error: "驗證碼錯誤或已過期" };
  }

  const rawNext = String(formData.get("next") ?? "");
  const next = rawNext.startsWith("/") ? rawNext : defaultNext;
  redirect(next);
}

export async function verifyLoginMfaAction(
  _prev: LoginVerifyState,
  formData: FormData,
): Promise<LoginVerifyState> {
  return verifyLoginMfa(formData, "/");
}

export async function superAdminVerifyLoginMfaAction(
  _prev: LoginVerifyState,
  formData: FormData,
): Promise<LoginVerifyState> {
  return verifyLoginMfa(formData, "/super-admin");
}
