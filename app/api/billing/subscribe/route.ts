import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGateway } from "@/lib/billing";
import type { SubscriptionRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

const BILLING_RETURN_URL =
  process.env.NEXT_PUBLIC_BILLING_RETURN_URL ?? "/billing";

/**
 * Activates the single paid plan (`pro`, NT$ 990/月) for the calling org.
 *
 * After the 2026-05 simplification there is no plan parameter (one tier only)
 * and no "schedule a switch" path:
 *
 *  - Org has no live subscription → gateway creates one inline. InstantGateway
 *    flips it to `active` and returns `successUrl`. Real gateways return their
 *    hosted checkout URL.
 *  - Org already has an active/past_due subscription with `cancel_at_period_end`
 *    pending → treat as a resume (clear the scheduled cancel).
 *  - Org already has an active/past_due subscription without a pending cancel →
 *    409 "already_subscribed".
 *
 * "Cancel" goes through `/api/billing/cancel` (period-end), "resume" through
 * `/api/billing/resume`.
 */
export async function POST() {
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

  if (hasLivePaid && current) {
    if (current.cancel_at_period_end) {
      try {
        await getGateway().resume(current.gateway_sub_id);
        return NextResponse.json({
          ok: true,
          resumed: true,
          periodEnd: current.current_period_end,
        });
      } catch (err) {
        console.error("[billing/subscribe] resume error", err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "resume_error" },
          { status: 500 },
        );
      }
    }
    return NextResponse.json(
      { error: "already_subscribed", periodEnd: current.current_period_end },
      { status: 409 },
    );
  }

  const successUrl = `${BILLING_RETURN_URL}?welcome=1`;
  const cancelUrl = BILLING_RETURN_URL;

  try {
    const result = await getGateway().createSubscription({
      orgId: org.id,
      plan: "pro",
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
