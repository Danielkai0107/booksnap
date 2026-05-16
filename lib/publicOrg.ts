import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrganizationRow } from "@/lib/supabase/types";

/**
 * Server-only helper that resolves an organization from its `public_slug`
 * (the URL prefix used by `/o/{slug}/*`).
 *
 * Wrapped in React's `cache` so a single request that hits both the layout
 * and the page only executes one query.
 *
 * Returns `null` for:
 *  - unknown slugs
 *  - non-approved orgs (so suspended / pending units can't run a public flow)
 */
export const getPublicOrg = cache(
  async (slug: string): Promise<OrganizationRow | null> => {
    if (!slug) return null;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .select("*")
      .eq("public_slug", slug)
      .maybeSingle();
    if (error) {
      console.error("[publicOrg] fetch failed", slug, error);
      return null;
    }
    if (!data) return null;
    if (data.status !== "approved") return null;
    return data as OrganizationRow;
  }
);

export type PhoneNormalizationResult = {
  /** Digits-only normalized phone (e.g. `0912345678`); used as the unique key. */
  phone: string;
  /** True when the cleaned phone passes the basic Taiwan-shaped sanity check. */
  ok: boolean;
};

/**
 * Loose phone normalization for the public borrow flow. We do NOT enforce a
 * strict TW format because some readers might use international formats; the
 * `(organization_id, phone)` unique constraint is what guarantees identity.
 */
export function normalizePhone(input: string): PhoneNormalizationResult {
  const trimmed = input.trim();
  // Strip every non-digit; this also turns "+886912..." into "886912..." and
  // "0912-345-678" into "0912345678".
  const digits = trimmed.replace(/\D+/g, "");
  // Treat "886912345678" as the canonical "0912345678" so users who switch
  // between dial-string and local format still hit the same row.
  const canonical =
    digits.startsWith("886") && digits.length === 12
      ? `0${digits.slice(3)}`
      : digits;
  return {
    phone: canonical,
    ok: canonical.length >= 8 && canonical.length <= 15,
  };
}
