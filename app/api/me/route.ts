import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_RECOGNIZE_MONTHLY_QUOTA,
  effectivePlan,
  getOrgPeriod,
  loadAppSettings,
  type OrgPlan,
} from "@/lib/plans";
import {
  isOrgLocked,
  trialDaysRemaining,
  trialState,
  type TrialState,
} from "@/lib/billing/lock";
import { maybeExpireSubscription } from "@/lib/billing/expire";
import type { SubscriptionRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * 2026-05 改：智能辨識每月軟上限 500 次，settings / scan 確認頁需要顯示
 * 剩餘次數。`quota` / `remaining` 跟 `/api/recognize` 的計算口徑一致。
 */
type UsagePayload = {
  ai: {
    used: number;
    quota: number;
    remaining: number;
    periodEnd: string;
  };
  books: { count: number };
};

type SubscriptionPayload = {
  status: SubscriptionRow["status"];
  plan: SubscriptionRow["plan"];
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  scheduledPlan: OrgPlan | null;
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
  let locked = false;
  let daysRemaining: number | null = null;
  let trialEndsAt: string | null = null;
  let state: TrialState | null = null;
  let billingEnabled = false;

  if (org) {
    const admin = createAdminClient();
    const [settings, sub] = await Promise.all([
      loadAppSettings(admin),
      maybeExpireSubscription(org.id, admin),
    ]);
    billingEnabled = settings.billingEnabled;
    subscription = sub;
    plan = effectivePlan(org, subscription);
    locked = isOrgLocked(org, subscription);
    daysRemaining = trialDaysRemaining(org);
    trialEndsAt = org.trial_ends_at;
    state = trialState(org, subscription);

    const { start, end } = getOrgPeriod(org, subscription);

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

    const aiUsed = aiRes.count ?? 0;
    usage = {
      ai: {
        used: aiUsed,
        quota: AI_RECOGNIZE_MONTHLY_QUOTA,
        remaining: Math.max(0, AI_RECOGNIZE_MONTHLY_QUOTA - aiUsed),
        periodEnd: end.toISOString(),
      },
      books: {
        count: booksRes.count ?? 0,
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
        scheduledPlan: subscription.scheduled_plan,
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
    locked,
    trialDaysRemaining: daysRemaining,
    trialEndsAt,
    trialState: state,
    billingEnabled,
  });
}
