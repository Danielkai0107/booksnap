/**
 * The single source of truth for "should this org be blocked from the two
 * paid-only entry points (new-book check-in, public borrow/catalog toggles)?".
 *
 * Replaces the old multi-tier quota system. After the 2026-05 simplification:
 *  - Every new org starts in `trial` with a 30-day countdown (see
 *    `organizations.trial_ends_at`).
 *  - Paid orgs (`pro` + an active/grace subscription) are never locked.
 *  - **Active trial** orgs (trial_ends_at in the future) are NOT locked —
 *    they get the full product to evaluate.
 *  - Only **expired trial / never-paid / post-cancellation** orgs are locked.
 *
 * The lock affects only:
 *  - The "新書入庫" buttons in `app/(unit)/page.tsx` (desktop + mobile FAB).
 *  - The "讓讀者可以掃碼借還 / 查書" toggles in `app/(unit)/public-link/`.
 *  - `/checkin` route entry (server-side redirect to `/?upgrade=1`).
 *  - Server-side defense in `/api/recognize` and `/api/books` POST.
 *
 * Everything else (books list, borrowers list, settings, billing page itself,
 * the public `/o/{slug}/...` borrow flow) stays accessible.
 */

import type { OrganizationRow, SubscriptionRow } from "@/lib/supabase/types";
import { effectivePlan } from "@/lib/plans";

export type TrialState =
  | "active_trial" // trial in progress, days remaining
  | "expired_trial" // trial countdown ran out, no subscription
  | "paid" // pro plan, subscription active or in grace
  | "cancelled_in_period"; // pro plan, cancel-at-period-end set but still within paid window

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isOrgLocked(
  org: Pick<OrganizationRow, "plan" | "trial_ends_at"> | null,
  subscription: SubscriptionRow | null,
  now: Date = new Date(),
): boolean {
  if (!org) return false; // no org context = nothing to lock

  const plan = effectivePlan(org, subscription, now);
  if (plan === "pro") return false;

  // 體驗期內完整解鎖 — "30 天體驗" 的承諾必須兌現，否則使用者沒辦法真的
  // 評估產品就被催升級。倒數天數仍會在側欄與 BillingClient 上顯示作為
  // 友善提醒；到期當天起 isOrgLocked 才會回 true 並擋下兩個入口。
  const ends = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : 0;
  if (ends > now.getTime()) return false;

  return true;
}

/**
 * Whole number of days left in the active trial, or `null` if the org has no
 * `trial_ends_at` set (e.g. a paid org whose trial column was cleared).
 *
 * Returns `0` when the trial has expired (today is past `trial_ends_at`). The
 * billing page renders this as "體驗已結束" rather than "剩 0 天" so callers
 * should also consult `trialState()` when wording the UI.
 */
export function trialDaysRemaining(
  org: Pick<OrganizationRow, "trial_ends_at"> | null,
  now: Date = new Date(),
): number | null {
  if (!org?.trial_ends_at) return null;
  const ends = new Date(org.trial_ends_at).getTime();
  const ms = ends - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / MS_PER_DAY);
}

export function trialState(
  org: Pick<OrganizationRow, "plan" | "trial_ends_at"> | null,
  subscription: SubscriptionRow | null,
  now: Date = new Date(),
): TrialState {
  const plan = effectivePlan(org ?? { plan: "trial" }, subscription, now);
  if (plan === "pro") {
    const cancelScheduled =
      subscription?.cancel_at_period_end === true ||
      subscription?.scheduled_plan === "trial";
    return cancelScheduled ? "cancelled_in_period" : "paid";
  }
  const remaining = trialDaysRemaining(org, now);
  if (remaining !== null && remaining > 0) return "active_trial";
  return "expired_trial";
}
