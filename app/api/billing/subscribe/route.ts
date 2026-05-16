import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateway } from "@/lib/billing";
import type { OrgPlan, SubscriptionRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

type SubscribeBody = { plan?: OrgPlan };

const BILLING_RETURN_URL =
  process.env.NEXT_PUBLIC_BILLING_RETURN_URL ?? "/billing";

/**
 * Starts a paid subscription **or** pre-arranges a plan switch on an
 * existing one. Behaviour by state:
 *
 *  - No live subscription (Free org): hand off to the gateway to activate
 *    immediately. InstantGateway flips the row to `active` inline and
 *    returns `successUrl`. Real gateways return their hosted checkout URL.
 *
 *  - Live subscription (`active` / `past_due`):
 *      target === current plan → clear any pending change ("keep current").
 *      target !== current plan → schedule the switch at `current_period_end`
 *                                 (no immediate billing, just a pre-arrange).
 *
 * "Downgrade to Free" goes through `/api/billing/cancel` instead, which is
 * just `schedulePlanChange('free')` semantically but kept separate so we
 * have a clear audit trail.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.profile.role === "super_admin") {
    return NextResponse.json(
      { error: "super admins cannot subscribe" },
      { status: 403 },
    );
  }
  const org = session.organization;
  if (!org || org.status !== "approved") {
    return NextResponse.json({ error: "org not approved" }, { status: 403 });
  }

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const plan = body.plan;
  if (plan !== "pro" && plan !== "plus") {
    return NextResponse.json(
      { error: "plan must be 'pro' or 'plus'" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", org.id)
    .maybeSingle();
  const current = (existing as SubscriptionRow | null) ?? null;
  const hasLivePaid =
    current !== null &&
    (current.status === "active" || current.status === "past_due");

  // Paid → paid: pre-arrange a switch (or clear it if target = current).
  if (hasLivePaid && current) {
    try {
      await getGateway().schedulePlanChange(
        current.gateway_sub_id,
        plan === current.plan ? null : plan,
      );
      return NextResponse.json({
        ok: true,
        scheduledPlan: plan === current.plan ? null : plan,
        periodEnd: current.current_period_end,
      });
    } catch (err) {
      console.error("[billing/subscribe] schedule error", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "schedule_error" },
        { status: 500 },
      );
    }
  }

  const successUrl = `${BILLING_RETURN_URL}?welcome=1`;
  const cancelUrl = BILLING_RETURN_URL;

  try {
    const result = await getGateway().createSubscription({
      orgId: org.id,
      plan,
      orgName: org.name,
      contactEmail: org.contact_email,
      successUrl,
      cancelUrl,
    });
    return NextResponse.json({
      redirectUrl: result.redirectUrl,
      gatewaySubId: result.gatewaySubId,
    });
  } catch (err) {
    console.error("[billing/subscribe] gateway error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "gateway_error" },
      { status: 500 },
    );
  }
}
