import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateway } from "@/lib/billing";
import type { SubscriptionRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Clears any pending cancellation ("保留目前方案"):
 *  - `scheduled_plan='trial'` (= `cancel_at_period_end=true`) → un-cancel,
 *    keeping the org on `pro` until the next billing cycle.
 *
 * After `current_period_end` has passed the row should already be `expired`
 * and the user needs to subscribe afresh; we 409 in that case.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const org = session.organization;
  if (!org) {
    return NextResponse.json({ error: "no_organization" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", org.id)
    .maybeSingle();
  const row = (sub as SubscriptionRow | null) ?? null;
  if (!row) {
    return NextResponse.json(
      { error: "no_active_subscription" },
      { status: 404 },
    );
  }

  // Already in the "no pending change" state — nothing to do.
  if (!row.cancel_at_period_end && row.scheduled_plan === null) {
    return NextResponse.json({ ok: true, alreadyActive: true });
  }
  if (new Date(row.current_period_end).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "subscription_already_expired" },
      { status: 409 },
    );
  }

  try {
    await getGateway().resume(row.gateway_sub_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[billing/resume] gateway error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "gateway_error" },
      { status: 500 },
    );
  }
}
