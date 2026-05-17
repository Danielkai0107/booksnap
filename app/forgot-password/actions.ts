"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";

export type ForgotPasswordState = {
  error?: string;
};

export type ResendRecoveryResult = {
  ok: boolean;
  error?: string;
};

/**
 * Sends a password recovery email via Supabase. We never tell the caller
 * whether the email actually exists in the system (returning that signal
 * would leak account enumeration), so the action just succeeds quietly and
 * any underlying Supabase error is logged server-side.
 *
 * The email template (configured in the Supabase Dashboard) embeds both
 * `{{ .ConfirmationURL }}` and `{{ .Token }}` so the recipient can either
 * click the link (PKCE flow → `/auth/callback`) or copy the OTP and paste
 * it into the reset form on a different device.
 */
async function sendRecoveryEmail(email: string, nextPath: string) {
  const origin = await getSiteOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
  });
  if (error) {
    console.error("[forgot-password] resetPasswordForEmail failed", error);
  }
}

/**
 * Form action for `/forgot-password`. Sends the recovery email and bounces
 * the user straight to `/reset-password/verify?email=…` — there is no intermediate
 * "we sent the email" splash screen anymore (UX optimisation: one less click,
 * the user is already prepared to enter the code from the email).
 */
export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "請輸入 Email" };

  await sendRecoveryEmail(email, "/reset-password");
  redirect(`/reset-password/verify?email=${encodeURIComponent(email)}`);
}

export async function superAdminForgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "請輸入 Email" };

  await sendRecoveryEmail(email, "/super-admin/reset-password");
  redirect(
    `/super-admin/reset-password/verify?email=${encodeURIComponent(email)}`,
  );
}

/**
 * Called from the "重新寄送" countdown button on `/reset-password/verify`. Reuses
 * the same email the user originally typed (passed via URL → form prop)
 * so they don't have to re-enter it. Returns a plain object instead of
 * redirecting because the reset form needs to stay mounted to keep the
 * password fields the user already typed.
 */
export async function resendRecoveryEmailAction(
  email: string,
  variant: "unit" | "super",
): Promise<ResendRecoveryResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, error: "找不到 Email，請重新申請" };
  }
  const nextPath =
    variant === "super" ? "/super-admin/reset-password" : "/reset-password";
  await sendRecoveryEmail(trimmed, nextPath);
  return { ok: true };
}
