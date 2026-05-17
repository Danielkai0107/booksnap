"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = {
  ok?: boolean;
  email?: string;
  error?: string;
};

/**
 * Sends a password recovery email via Supabase. We always return `ok: true`
 * (regardless of whether the email exists in the system) so the form does not
 * leak which addresses are registered. Real errors are logged server-side.
 *
 * The email itself is customised in the Supabase Dashboard's "Reset Password"
 * template to include both `{{ .ConfirmationURL }}` (the main link) and
 * `{{ .Token }}` (a 6-digit OTP) — the OTP is the fallback path when the
 * recipient's mail server prefetches links and silently consumes the token.
 *
 * The `next` parameter passed to `/auth/callback` decides which reset page the
 * user lands on after the link is clicked (unit vs super-admin).
 */
async function sendRecoveryEmail(email: string, nextPath: string) {
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
  });
  if (error) {
    console.error("[forgot-password] resetPasswordForEmail failed", error);
  }
}

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "請輸入 Email" };

  await sendRecoveryEmail(email, "/reset-password");
  return { ok: true, email };
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
  return { ok: true, email };
}
