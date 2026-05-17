import { createClient } from "@supabase/supabase-js";

/**
 * 驗證 Email／密碼是否正確，但不寫入 cookie、不影響其他裝置的 session。
 * 登入 OTP 流程應使用此函式，避免 signInWithPassword + signOut(global) 踢掉已登入裝置。
 */
export async function verifyPasswordWithoutSession(
  email: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const ephemeral = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await ephemeral.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { ok: false };
  }

  await ephemeral.auth.signOut({ scope: "local" });
  return { ok: true, userId: data.user.id };
}
