import type { SupabaseClient } from "@supabase/supabase-js";

/** 只登出目前裝置／瀏覽器，不影響其他已登入裝置。 */
export async function signOutLocal(supabase: SupabaseClient) {
  await supabase.auth.signOut({ scope: "local" });
}

/** 登出所有裝置（例如註銷帳號後）。 */
export async function signOutGlobal(supabase: SupabaseClient) {
  await supabase.auth.signOut({ scope: "global" });
}
