import { createClient } from "@/lib/supabase/server";

/** 密碼驗證通過後寄送登入用 Email OTP（不建立 session）。 */
export async function sendLoginEmailOtp(email: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    console.error("[login] signInWithOtp failed", error);
    return "無法寄送驗證信，請稍後再試";
  }
  return null;
}
