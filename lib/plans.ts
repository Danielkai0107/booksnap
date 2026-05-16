/**
 * Single source of truth for plan metadata, monthly/total quotas, and billing-anchored period math.
 *
 * Quotas are enforced server-side in `/api/recognize` and `/api/books` POST when
 * `BILLING_QUOTA_ENFORCED=true` and the org has `bypass_quota=false`. See
 * `lib/billing/flags.ts`. Both the sidebar and the super-admin pages call into
 * this module so the displayed quota / pill label stay consistent whenever we
 * tweak the limits or add a new tier.
 *
 * Numbers (quotas + prices) live in the `plan_configs` table and are loaded
 * via `loadPlanConfigs()` below; PLAN_QUOTAS / PLAN_PRICE remain as fallback
 * defaults when the DB is unreachable. PLAN_META is hard-coded UI metadata
 * (label / pill colour) — not user-tunable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import type {
  OrgPlan,
  OrganizationRow,
  SubscriptionRow,
} from "./supabase/types";

export type { OrgPlan } from "./supabase/types";

/**
 * Tier ordering, from lowest to highest. Pro is intentionally the top tier
 * (more expensive, larger quotas); Plus is the entry-level paid tier. Keep
 * this in sync with PLAN_QUOTAS / PLAN_PRICE below.
 */
export const PLAN_ORDER: readonly OrgPlan[] = ["free", "plus", "pro"] as const;

export type PlanQuotaConfig = { ai: number; books: number };
export type PlanPriceConfig = { monthly: number; label: string };

/**
 * Hard-coded fallback values, also used to seed the `plan_configs` table.
 * Keep in sync with the migration `add_plan_configs_table`.
 */
export const PLAN_QUOTAS: Record<OrgPlan, PlanQuotaConfig> = {
  free: { ai: 20, books: 100 },
  plus: { ai: 200, books: 500 },
  pro: { ai: 1000, books: 3000 },
};

export const PLAN_META: Record<
  OrgPlan,
  { label: string; pillClass: string }
> = {
  free: {
    label: "Free",
    pillClass: "bg-neutral-100 text-neutral-700 border-neutral-200",
  },
  plus: {
    label: "Plus",
    pillClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  pro: {
    label: "Pro",
    pillClass: "bg-indigo-50 text-indigo-700 border-indigo-100",
  },
};

/**
 * Monthly subscription prices in TWD. Plus is the entry paid tier; Pro is the
 * top tier. The label is rendered as-is on the upgrade modal & billing page.
 */
export const PLAN_PRICE: Record<OrgPlan, PlanPriceConfig> = {
  free: { monthly: 0, label: "免費" },
  plus: { monthly: 299, label: "NT$ 299／月" },
  pro: { monthly: 999, label: "NT$ 999／月" },
};

export type PlanConfigs = {
  quotas: Record<OrgPlan, PlanQuotaConfig>;
  prices: Record<OrgPlan, PlanPriceConfig>;
};

export function formatPriceLabel(plan: OrgPlan, monthly: number): string {
  if (plan === "free" || monthly === 0) return "免費";
  return `NT$ ${monthly.toLocaleString()}／月`;
}

const FALLBACK_PLAN_CONFIGS: PlanConfigs = {
  quotas: PLAN_QUOTAS,
  prices: PLAN_PRICE,
};

type CacheEntry = { value: PlanConfigs; loadedAt: number };
let cached: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 1000;

/**
 * Reads `plan_configs` once per process and caches for 60s. Super-admin edits
 * call `invalidatePlanConfigsCache()` so the same instance picks up changes
 * immediately. Other instances (in a multi-pod deployment) see them after the
 * TTL — acceptable for plan-tuning operations which are rare and reversible.
 *
 * If the DB is unreachable or the table is empty, falls back to the
 * hardcoded `PLAN_QUOTAS` / `PLAN_PRICE` constants so the app keeps serving.
 */
export async function loadPlanConfigs(
  client?: SupabaseClient,
  options?: { bypassCache?: boolean },
): Promise<PlanConfigs> {
  if (!options?.bypassCache && cached) {
    if (Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value;
  }

  const admin = client ?? createAdminClient();
  const { data, error } = await admin.from("plan_configs").select("*");
  if (error || !data || data.length === 0) {
    if (error) console.warn("[plans] loadPlanConfigs error, falling back", error);
    return FALLBACK_PLAN_CONFIGS;
  }

  const quotas: Record<OrgPlan, PlanQuotaConfig> = { ...PLAN_QUOTAS };
  const prices: Record<OrgPlan, PlanPriceConfig> = { ...PLAN_PRICE };
  for (const row of data as Array<{
    plan: OrgPlan;
    ai_quota: number;
    book_quota: number;
    monthly_price: number;
  }>) {
    if (!PLAN_ORDER.includes(row.plan)) continue;
    quotas[row.plan] = { ai: row.ai_quota, books: row.book_quota };
    prices[row.plan] = {
      monthly: row.monthly_price,
      label: formatPriceLabel(row.plan, row.monthly_price),
    };
  }
  const value: PlanConfigs = { quotas, prices };
  cached = { value, loadedAt: Date.now() };
  return value;
}

export function invalidatePlanConfigsCache(): void {
  cached = null;
}

/**
 * Returns the current billing period for an organization, anchored to its activation/creation
 * day-of-month. Handles months whose last day is earlier than the anchor (e.g. anchor day 31 in
 * February) by clamping to the last day of the target month.
 *
 * Example: anchor 2026-03-17, now 2026-05-10 → [2026-04-17, 2026-05-17)
 * Example: anchor 2026-01-31, now 2026-02-20 → [2026-01-31, 2026-02-28)
 */
export function getPeriodRange(
  anchorISO: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const anchor = new Date(anchorISO);
  const anchorDay = anchor.getUTCDate();

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const lastDayThisMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const thisMonthAnchorDay = Math.min(anchorDay, lastDayThisMonth);

  let startYear: number;
  let startMonth: number;
  if (now.getUTCDate() >= thisMonthAnchorDay) {
    startYear = year;
    startMonth = month;
  } else {
    if (month === 0) {
      startYear = year - 1;
      startMonth = 11;
    } else {
      startYear = year;
      startMonth = month - 1;
    }
  }

  const lastDayStartMonth = new Date(
    Date.UTC(startYear, startMonth + 1, 0),
  ).getUTCDate();
  const startDay = Math.min(anchorDay, lastDayStartMonth);
  const start = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0));

  let endYear: number;
  let endMonth: number;
  if (startMonth === 11) {
    endYear = startYear + 1;
    endMonth = 0;
  } else {
    endYear = startYear;
    endMonth = startMonth + 1;
  }
  const lastDayEndMonth = new Date(
    Date.UTC(endYear, endMonth + 1, 0),
  ).getUTCDate();
  const endDay = Math.min(anchorDay, lastDayEndMonth);
  const end = new Date(Date.UTC(endYear, endMonth, endDay, 0, 0, 0, 0));

  return { start, end };
}

/**
 * Returns the *currently effective* plan for an organization, taking the
 * subscription state into account. Used everywhere we display the plan pill
 * or check quota.
 *
 * - active / past_due → subscription.plan (paid window still applies)
 * - cancelled but still inside `current_period_end` → subscription.plan
 * - everything else → org.plan (which defaults to 'free' for new orgs)
 *
 * NOTE: callers should pass the org's stored `plan` column too, because the
 * "variance escape hatch" (super admin manually setting plan on org) still
 * needs to work for legacy / VIP rows that don't have a real subscription.
 */
export function effectivePlan(
  org: Pick<OrganizationRow, "plan">,
  subscription: SubscriptionRow | null,
  now: Date = new Date(),
): OrgPlan {
  if (!subscription) return org.plan;
  const periodEnd = new Date(subscription.current_period_end).getTime();
  if (subscription.status === "active" || subscription.status === "past_due") {
    return subscription.plan;
  }
  if (
    subscription.status === "cancelled" &&
    periodEnd > now.getTime()
  ) {
    return subscription.plan;
  }
  return org.plan;
}

/**
 * Returns the current billing period for an organization. If the org has an
 * active subscription, use the subscription's period (paid-day-of-month
 * anchor). Otherwise fall back to the legacy approved_at/created_at anchor so
 * Free-tier counters keep the same monthly behaviour.
 */
export function getOrgPeriod(
  org: Pick<OrganizationRow, "approved_at" | "created_at">,
  subscription: SubscriptionRow | null,
  now: Date = new Date(),
): { start: Date; end: Date } {
  if (
    subscription &&
    (subscription.status === "active" ||
      subscription.status === "past_due" ||
      subscription.status === "cancelled")
  ) {
    return {
      start: new Date(subscription.current_period_start),
      end: new Date(subscription.current_period_end),
    };
  }
  const anchorISO = org.approved_at ?? org.created_at;
  return getPeriodRange(anchorISO, now);
}
