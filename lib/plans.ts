/**
 * Single source of truth for plan metadata, the paid price, and
 * billing-anchored period math.
 *
 * 2026-05 simplification: the multi-tier free/plus/pro model was collapsed
 * to a single paid tier (`pro`) plus a free `trial` state. Quotas no longer
 * exist; the upgrade gate is binary (`isOrgLocked` in `lib/billing/lock.ts`).
 *
 * The paid price lives in the `plan_configs` table (still editable via the
 * super-admin plans page); other tunables (default trial days) live in
 * `app_settings`. Both are cached in-process for 60s.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import type {
  OrganizationRow,
  OrgPlan,
  PaidPlan,
  SubscriptionRow,
} from "./supabase/types";

export type { OrgPlan } from "./supabase/types";

/**
 * Tier ordering used by UI helpers. Only `trial` and `pro` exist now.
 */
export const PLAN_ORDER: readonly OrgPlan[] = ["trial", "pro"] as const;

export type PlanPriceConfig = { monthly: number; label: string };

/** 體驗相關狀態 tag：白底灰框，低調不施壓。 */
export const EXPERIENCE_TAG_CLASS =
  "bg-white text-neutral-600 border-neutral-200";

export const PLAN_META: Record<
  OrgPlan,
  { label: string; pillClass: string }
> = {
  trial: {
    label: "體驗中",
    pillClass: EXPERIENCE_TAG_CLASS,
  },
  pro: {
    label: "Pro",
    pillClass: "bg-indigo-50 text-indigo-700 border-indigo-100",
  },
};

/**
 * Hard-coded fallback prices, used to seed `plan_configs` and as a safety net
 * when the DB is unreachable. Keep in sync with the migration.
 */
export const PLAN_PRICE: Record<OrgPlan, PlanPriceConfig> = {
  trial: { monthly: 0, label: "免費體驗" },
  pro: { monthly: 990, label: "NT$ 990／月" },
};

/**
 * 每月智能辨識（書封 OCR）次數軟上限。
 *
 * 達上限後僅「拍照入庫時跳過 AI 辨識、直接帶空書名進確認頁」，
 * 不阻擋手動入庫、不阻擋其他功能，不彈升級提示——刻意維持低噪音。
 * 計算窗口跟著訂閱 / 體驗期週期走（見 `getOrgPeriod`），週期翻頁時
 * `ai_usage_logs` 的 created_at 過濾會自動讓 used count 歸零。
 *
 * 數字選 500 是基於 Opus 4.7 單張 ~NT$0.23 的成本，500 次約 NT$115，
 * 占 NT$ 990 月費約 12%，留出毛利空間給其他成本（Supabase、頻寬、Google Books quota）。
 */
export const AI_RECOGNIZE_MONTHLY_QUOTA = 500;

export type PlanConfigs = {
  /** Single editable paid price; trial is always 0. */
  prices: Record<OrgPlan, PlanPriceConfig>;
};

export type AppSettings = {
  /** Default trial length applied at org approval. Editable in super-admin settings. */
  trialDays: number;
  /**
   * Master switch for monetization. When `false` the `/billing` page shows a
   * BillingPausedBanner and disables the 升級 Pro CTA; every locked entry
   * point in the app routes the user to `/billing` so they see the full
   * context. Lets us ship to early users before any real gateway is wired up.
   */
  billingEnabled: boolean;
};

const DEFAULT_TRIAL_DAYS = 30;
const DEFAULT_BILLING_ENABLED = false;

export function formatPriceLabel(plan: OrgPlan, monthly: number): string {
  if (plan === "trial" || monthly === 0) return "免費體驗";
  return `NT$ ${monthly.toLocaleString()}／月`;
}

const FALLBACK_PLAN_CONFIGS: PlanConfigs = { prices: PLAN_PRICE };
const FALLBACK_APP_SETTINGS: AppSettings = {
  trialDays: DEFAULT_TRIAL_DAYS,
  billingEnabled: DEFAULT_BILLING_ENABLED,
};

type CacheEntry<T> = { value: T; loadedAt: number };
const CACHE_TTL_MS = 60 * 1000;

let planCache: CacheEntry<PlanConfigs> | null = null;
let settingsCache: CacheEntry<AppSettings> | null = null;

/**
 * Reads the single `pro` row from `plan_configs`. Returns fallback prices when
 * the row is missing or the DB is unreachable so the app keeps serving.
 */
export async function loadPlanConfigs(
  client?: SupabaseClient,
  options?: { bypassCache?: boolean },
): Promise<PlanConfigs> {
  if (!options?.bypassCache && planCache) {
    if (Date.now() - planCache.loadedAt < CACHE_TTL_MS) return planCache.value;
  }

  const admin = client ?? createAdminClient();
  const { data, error } = await admin
    .from("plan_configs")
    .select("plan, monthly_price")
    .eq("plan", "pro")
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("[plans] loadPlanConfigs error, falling back", error);
    return FALLBACK_PLAN_CONFIGS;
  }

  const row = data as { plan: PaidPlan; monthly_price: number };
  const prices: Record<OrgPlan, PlanPriceConfig> = {
    trial: PLAN_PRICE.trial,
    pro: {
      monthly: row.monthly_price,
      label: formatPriceLabel("pro", row.monthly_price),
    },
  };
  const value: PlanConfigs = { prices };
  planCache = { value, loadedAt: Date.now() };
  return value;
}

export function invalidatePlanConfigsCache(): void {
  planCache = null;
}

/**
 * Reads tunable runtime settings. Each row is `{key, value: jsonb}` so we
 * fetch the whole tiny table and unpack the keys we know about; unknown rows
 * are ignored. Falls back to defaults on errors so the app keeps serving.
 * The super-admin settings page should call `invalidateAppSettingsCache()`
 * after writes.
 */
export async function loadAppSettings(
  client?: SupabaseClient,
  options?: { bypassCache?: boolean },
): Promise<AppSettings> {
  if (!options?.bypassCache && settingsCache) {
    if (Date.now() - settingsCache.loadedAt < CACHE_TTL_MS) {
      return settingsCache.value;
    }
  }

  const admin = client ?? createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", ["trial_days", "billing_enabled"]);
  if (error) {
    console.warn("[plans] loadAppSettings error, falling back", error);
    return FALLBACK_APP_SETTINGS;
  }

  const rows = (data ?? []) as { key: string; value: unknown }[];
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const trialDays =
    coerceTrialDays(byKey.get("trial_days")) ?? DEFAULT_TRIAL_DAYS;
  const billingEnabled =
    coerceBool(byKey.get("billing_enabled")) ?? DEFAULT_BILLING_ENABLED;
  const value: AppSettings = { trialDays, billingEnabled };
  settingsCache = { value, loadedAt: Date.now() };
  return value;
}

export function invalidateAppSettingsCache(): void {
  settingsCache = null;
}

function coerceTrialDays(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function coerceBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw === "true") return true;
    if (raw === "false") return false;
  }
  return null;
}

/**
 * Returns the current billing period for an organization, anchored to its
 * activation/creation day-of-month. Clamps months whose last day is earlier
 * than the anchor (e.g. anchor day 31 in February).
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
 * Effective plan for an org, taking subscription state into account.
 * Used to display the pill, drive the lock decision, and surface "you are paid"
 * vs "you are still trialing" copy.
 *
 *  - active / past_due → `pro` (paid window still applies)
 *  - cancelled but still inside `current_period_end` → `pro`
 *  - everything else → org.plan (which is `trial` for non-paid orgs after the
 *    2026-05 migration)
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
  if (subscription.status === "cancelled" && periodEnd > now.getTime()) {
    return subscription.plan;
  }
  return org.plan;
}

/**
 * Returns the period range used for "this month" stats (e.g. the settings
 * page's OCR-this-period count). Anchors to the subscription start when paid,
 * otherwise falls back to the org's approval/creation day so trial orgs still
 * see a monthly counter that rolls over predictably.
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
