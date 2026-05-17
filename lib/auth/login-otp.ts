import { createClient } from "@/lib/supabase/server";
import { toLoginOtpSendMessage } from "@/lib/auth/login-otp-messages";

/**
 * 密碼驗證通過後寄送登入用 Email OTP（不建立 session）。
 *
 * Supabase 使用 **Magic Link** 模板（非 Signup / Recovery）。
 * 繁中內容請在 Dashboard 貼上 `docs/supabase-email-templates/magic-link.html`。
 *
 * 寄信頻率上限請在 Supabase Dashboard → Authentication → Rate Limits 調整。
 */
export async function sendLoginEmailOtp(email: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    console.error("[login] signInWithOtp failed", error);
    return toLoginOtpSendMessage(error);
  }
  return null;
}
