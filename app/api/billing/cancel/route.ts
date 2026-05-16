import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateway } from "@/lib/billing";
import type { SubscriptionRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Schedules a cancel-at-period-end on the current subscription. The user still
 * enjoys their paid plan until `current_period_end`; the row is flipped to
 * `expired` lazily by `maybeExpireSubscription` once that date passes.
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
  if (row.status !== "active" && row.status !== "past_due") {
    return NextResponse.json(
      { error: "not_cancellable", status: row.status },
      { status: 409 },
    );
  }
  if (row.cancel_at_period_end) {
    return NextResponse.json({ ok: true, alreadyCancelled: true });
  }

  try {
    await getGateway().cancelAtPeriodEnd(row.gateway_sub_id);
    return NextResponse.json({
      ok: true,
      periodEnd: row.current_period_end,
    });
  } catch (err) {
    console.error("[billing/cancel] gateway error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "gateway_error" },
      { status: 500 },
    );
  }
}
