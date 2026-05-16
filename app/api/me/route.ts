import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLAN_QUOTAS,
  effectivePlan,
  getOrgPeriod,
  type OrgPlan,
} from "@/lib/plans";
import { isQuotaEnforced } from "@/lib/billing/flags";
import { maybeExpireSubscription } from "@/lib/billing/expire";
import type { SubscriptionRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

type UsagePayload = {
  ai: { used: number; limit: number; periodEnd: string };
  books: { count: number; limit: number };
};

type SubscriptionPayload = {
  status: SubscriptionRow["status"];
  plan: SubscriptionRow["plan"];
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  gateway: string;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const org = session.organization;
  const storedPlan: OrgPlan | null = org?.plan ?? null;

  let usage: UsagePayload | null = null;
  let plan: OrgPlan | null = storedPlan;
  let subscription: SubscriptionRow | null = null;

  if (org) {
    const admin = createAdminClient();
    // maybeExpireSubscription is idempotent and cheap (one indexed lookup + at
    // most one update). We do it here so any stale `past_due` / `cancelled`
    // row is normalised before the dashboard reads its plan.
    subscription = await maybeExpireSubscription(org.id, admin);
    plan = effectivePlan(org, subscription);

    const { start, end } = getOrgPeriod(org, subscription);
    const quotas = PLAN_QUOTAS[plan];

    const [aiRes, booksRes] = await Promise.all([
      admin
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .gte("created_at", start.toISOString()),
      admin
        .from("books")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id),
    ]);

    usage = {
      ai: {
        used: aiRes.count ?? 0,
        limit: quotas.ai,
        periodEnd: end.toISOString(),
      },
      books: {
        count: booksRes.count ?? 0,
        limit: quotas.books,
      },
    };
  }

  const subscriptionPayload: SubscriptionPayload | null = subscription
    ? {
        status: subscription.status,
        plan: subscription.plan,
        startedAt: subscription.started_at,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelledAt: subscription.cancelled_at,
        gateway: subscription.gateway,
      }
    : null;

  return NextResponse.json({
    orgId: org?.id ?? null,
    orgName: org?.name ?? null,
    publicSlug: org?.public_slug ?? null,
    role: session.profile.role,
    email: session.email,
    plan,
    storedPlan,
    subscription: subscriptionPayload,
    usage,
    quotaEnforced: isQuotaEnforced(org ?? undefined),
  });
}
