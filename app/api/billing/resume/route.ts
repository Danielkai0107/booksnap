import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateway } from "@/lib/billing";
import type { SubscriptionRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Undoes a `cancel_at_period_end` flag while the subscription is still inside
 * its paid window. After `current_period_end` has passed, the row should already
 * be `expired` and the user needs to subscribe afresh.
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

  if (!row.cancel_at_period_end) {
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
