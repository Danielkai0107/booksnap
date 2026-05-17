import type { SupabaseClient } from "@supabase/supabase-js";

/** 刪除單位及其關聯資料（service role）。 */
export async function purgeOrganization(
  admin: SupabaseClient,
  orgId: string,
): Promise<void> {
  const tables = [
    "borrow_records",
    "public_action_logs",
    "books",
    "borrowers",
    "categories",
    "shelves",
    "ai_usage_logs",
    "payments",
    "subscriptions",
  ] as const;

  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq("organization_id", orgId);
    if (error) {
      throw new Error(error.message);
    }
  }

  const { error: profilesErr } = await admin
    .from("profiles")
    .delete()
    .eq("organization_id", orgId);
  if (profilesErr) {
    throw new Error(profilesErr.message);
  }

  const { error: orgErr } = await admin
    .from("organizations")
    .delete()
    .eq("id", orgId);
  if (orgErr) {
    throw new Error(orgErr.message);
  }
}
