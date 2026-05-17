import { requireUnitSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAppSettings, loadPlanConfigs } from "@/lib/plans";
import { trialState, trialDaysRemaining } from "@/lib/billing/lock";
import { maybeExpireSubscription } from "@/lib/billing/expire";
import type { PaymentRow, SubscriptionRow } from "@/lib/supabase/types";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

/** Maps `?from=xxx` (set by upstream locked entry points) to a friendly
 * one-liner shown above the StatusCard. Tells the user why they landed here
 * so the upgrade gate doesn't feel like a non-sequitur. */
const REASON_COPY: Record<string, string> = {
  new_book: "需要升級後才能新增書本入庫，目前可繼續瀏覽試用內容。",
  public_link: "借閱連結 / QR 為付費功能，升級後即可分享給讀者。",
};

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    welcome?: string;
    reason?: string;
    from?: string;
  }>;
}) {
  const session = await requireUnitSession();
  const org = session.organization!;

  const admin = createAdminClient();
  const subscription = await maybeExpireSubscription(org.id, admin);
  const [{ prices }, { billingEnabled }] = await Promise.all([
    loadPlanConfigs(admin),
    loadAppSettings(admin),
  ]);
  const state = trialState(org, subscription);
  const daysRemaining = trialDaysRemaining(org);

  const { data: paymentsData } = await admin
    .from("payments")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const payments = (paymentsData ?? []) as PaymentRow[];

  const sp = await searchParams;
  const initialBanner = sp.welcome === "1" ? "welcome" : sp.reason ?? null;
  const reasonCopy = sp.from ? (REASON_COPY[sp.from] ?? null) : null;

  return (
    <BillingClient
      proPrice={prices.pro}
      trialState={state}
      trialDaysRemaining={daysRemaining}
      trialEndsAt={org.trial_ends_at}
      subscription={serializeSubscription(subscription)}
      payments={payments.map(serializePayment)}
      initialBanner={initialBanner}
      billingEnabled={billingEnabled}
      reasonCopy={reasonCopy}
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
    scheduledPlan: sub.scheduled_plan,
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
