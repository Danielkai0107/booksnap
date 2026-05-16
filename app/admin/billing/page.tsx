import { requireUnitSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLAN_META,
  PLAN_PRICE,
  PLAN_QUOTAS,
  effectivePlan,
} from "@/lib/plans";
import { maybeExpireSubscription } from "@/lib/billing/expire";
import type {
  PaymentRow,
  SubscriptionRow,
} from "@/lib/supabase/types";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    welcome?: string;
    reason?: string;
    plan?: string;
  }>;
}) {
  const session = await requireUnitSession();
  const org = session.organization!;

  const admin = createAdminClient();
  const subscription = await maybeExpireSubscription(org.id, admin);
  const plan = effectivePlan(org, subscription);

  const { data: paymentsData } = await admin
    .from("payments")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const payments = (paymentsData ?? []) as PaymentRow[];

  const sp = await searchParams;
  const initialBanner =
    sp.welcome === "1"
      ? "welcome"
      : sp.reason === "ai_quota"
        ? "ai_quota"
        : sp.reason === "book_quota"
          ? "book_quota"
          : null;
  const highlightPlan =
    sp.plan === "pro" || sp.plan === "plus" ? sp.plan : null;

  return (
    <BillingClient
      orgName={org.name}
      plan={plan}
      planMeta={PLAN_META[plan]}
      planPrice={PLAN_PRICE[plan]}
      planQuotas={PLAN_QUOTAS[plan]}
      subscription={serializeSubscription(subscription)}
      payments={payments.map(serializePayment)}
      initialBanner={initialBanner}
      highlightPlan={highlightPlan}
    />
  );
}

function serializeSubscription(sub: SubscriptionRow | null) {
  if (!sub) return null;
  return {
    id: sub.id,
    status: sub.status,
    plan: sub.plan,
    startedAt: sub.started_at,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    cancelledAt: sub.cancelled_at,
    gateway: sub.gateway,
  };
}

function serializePayment(p: PaymentRow) {
  return {
    id: p.id,
    amount: p.amount,
    status: p.status,
    gateway: p.gateway,
    periodStart: p.period_start,
    periodEnd: p.period_end,
    createdAt: p.created_at,
  };
}
