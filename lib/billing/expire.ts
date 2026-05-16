import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionRow } from "@/lib/supabase/types";
import { writeAuditLog } from "./apply";

const PAST_DUE_GRACE_DAYS = 7;

/**
 * Cheap idempotent check we sprinkle into `/api/me`, `requireUnitSession`, and
 * the super-admin views so a single hot read is enough to flip a subscription
 * to `expired` once its grace window closes. There is no cron job; if no one
 * looks at the org for months, the row stays `cancelled`/`past_due` and the
 * `effectivePlan` calculation already treats them correctly.
 *
 *  - `past_due` + (period_end + 7d) past → `expired`
 *  - `cancelled` + period_end past → `expired`
 *
 * Returns the (possibly updated) subscription, or `null` if the org has none.
 */
export async function maybeExpireSubscription(
  orgId: string,
  client?: SupabaseClient,
): Promise<SubscriptionRow | null> {
  const admin = client ?? createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  const sub = (data as SubscriptionRow | null) ?? null;
  if (!sub) return null;

  const now = Date.now();
  const periodEnd = new Date(sub.current_period_end).getTime();

  let shouldExpire = false;
  if (sub.status === "past_due") {
    const graceEnd = periodEnd + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
    if (graceEnd < now) shouldExpire = true;
  } else if (sub.status === "cancelled") {
    if (periodEnd < now) shouldExpire = true;
  } else if (sub.status === "active" && sub.cancel_at_period_end) {
    if (periodEnd < now) shouldExpire = true;
  }

  if (!shouldExpire) return sub;

  const { data: updated, error } = await admin
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("id", sub.id)
    .select("*")
    .single();
  if (error) {
    console.error("[billing] maybeExpireSubscription update error", error);
    return sub;
  }

  await writeAuditLog(admin, {
    actor_id: null,
    actor_role: "system",
    action: "sub.expired",
    target_org_id: sub.organization_id,
    meta: {
      from_status: sub.status,
      period_end: sub.current_period_end,
    },
  });

  return updated as SubscriptionRow;
}
