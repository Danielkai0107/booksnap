/**
 * Single source of truth for plan metadata, monthly/total quotas, and billing-anchored period math.
 *
 * v1 is display-only: nothing in the codebase blocks behaviour based on these numbers. Both the
 * sidebar and the super-admin pages call into this module so the displayed quota / pill label
 * stay consistent whenever we tweak the limits or add a new tier.
 */

import type { OrgPlan } from "./supabase/types";

export type { OrgPlan } from "./supabase/types";

export const PLAN_ORDER: readonly OrgPlan[] = ["free", "pro", "plus"] as const;

export const PLAN_QUOTAS: Record<OrgPlan, { ai: number; books: number }> = {
  free: { ai: 20, books: 100 },
  pro: { ai: 200, books: 500 },
  plus: { ai: 1000, books: 3000 },
};

export const PLAN_META: Record<
  OrgPlan,
  { label: string; pillClass: string }
> = {
  free: {
    label: "Free",
    pillClass: "bg-neutral-100 text-neutral-700 border-neutral-200",
  },
  pro: {
    label: "Pro",
    pillClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  plus: {
    label: "Plus",
    pillClass: "bg-indigo-50 text-indigo-700 border-indigo-100",
  },
};

/**
 * Monthly subscription prices in TWD. v1 is display-only — these strings show up on
 * the upgrade modal, no payment is collected yet. Adjust here when pricing is finalised.
 */
export const PLAN_PRICE: Record<OrgPlan, { monthly: number; label: string }> = {
  free: { monthly: 0, label: "免費" },
  pro: { monthly: 299, label: "NT$ 299／月" },
  plus: { monthly: 999, label: "NT$ 999／月" },
};

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
