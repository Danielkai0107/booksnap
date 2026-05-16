import type { OrganizationRow } from "@/lib/supabase/types";

/**
 * Global kill-switch for quota enforcement. `BILLING_QUOTA_ENFORCED=true` makes
 * `/api/recognize` and `/api/books` POST return 402 when the org is over the
 * monthly AI quota / book count limit for its effective plan.
 *
 * Default is `false` so we can soft-launch and observe usage before flipping
 * the switch globally. Set on Vercel/Supabase env without redeploying code.
 */
function globalEnforced(): boolean {
  return (process.env.BILLING_QUOTA_ENFORCED ?? "false").toLowerCase() ===
    "true";
}

/**
 * Should we hard-block this org when it exceeds its quota?
 *
 * Rules (AND-ed):
 *  - `BILLING_QUOTA_ENFORCED` must be `true`
 *  - The org must not have `bypass_quota=true` (super admin VIP exemption)
 *
 * Pass `undefined` if the org isn't loaded yet (e.g. very early in a request);
 * we fall back to the global switch.
 */
export function isQuotaEnforced(
  org?: Pick<OrganizationRow, "bypass_quota"> | null,
): boolean {
  if (!globalEnforced()) return false;
  if (org && org.bypass_quota) return false;
  return true;
}

export function isQuotaEnforcedGlobally(): boolean {
  return globalEnforced();
}
