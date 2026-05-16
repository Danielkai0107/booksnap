import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateway } from "@/lib/billing";
import type { OrgPlan, SubscriptionRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

type SubscribeBody = { plan?: OrgPlan };

const BILLING_RETURN_URL =
  process.env.NEXT_PUBLIC_BILLING_RETURN_URL ?? "/admin/billing";

/**
 * Starts (or restarts) a paid subscription for the authenticated unit.
 *
 * Flow:
 *  1. Reject if the org already has a live subscription on a *different* plan.
 *     V1 doesn't handle proration; user must cancel first.
 *  2. Hand off to the active payment gateway. InstantGateway returns
 *     immediately with `redirectUrl=/admin/billing?welcome=1` and the
 *     subscription is already `active`. Real gateways will return their
 *     hosted checkout URL; the `webhook` route then activates the row.
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
  if (
    current &&
    (current.status === "active" || current.status === "past_due") &&
    current.plan !== plan
  ) {
    return NextResponse.json(
      {
        error: "active_subscription_other_plan",
        message:
          "目前已有訂閱中的方案。請先取消當前訂閱（期末停用）後再切換方案。",
        currentPlan: current.plan,
      },
      { status: 409 },
    );
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
