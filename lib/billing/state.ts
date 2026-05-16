import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrganizationRow, SubscriptionRow } from "@/lib/supabase/types";
import { maybeExpireSubscription } from "./expire";

/**
 * Convenience helper used by API routes that need to know "what's this org's
 * effective plan, period, and bypass status right now?" without re-reading the
 * organization row each time. Also runs the lazy expiry check.
 */
export async function loadOrgBillingState(
  orgId: string,
  client?: SupabaseClient,
): Promise<{
  org: OrganizationRow | null;
  subscription: SubscriptionRow | null;
}> {
  const admin = client ?? createAdminClient();
  const [{ data: orgRow }, subscription] = await Promise.all([
    admin.from("organizations").select("*").eq("id", orgId).maybeSingle(),
    maybeExpireSubscription(orgId, admin),
  ]);
  return {
    org: (orgRow as OrganizationRow | null) ?? null,
    subscription,
  };
}
