export type BookRow = {
  id: string;
  book_id: string;
  title: string;
  admin_name: string;
  checkin_time: string;
  image_url: string | null;
  status: "available" | "borrowed" | string;
  shelf_id: string | null;
  return_time: string | null;
  /** Denormalized display name of the current holder (kept in sync on borrow/return for fast public catalog rendering). */
  current_holder: string | null;
  current_holder_id: string | null;
  current_location: string | null;
  organization_id: string;
  category_id: string | null;
  isbn: string | null;
  authors: string | null;
  publisher: string | null;
  published_date: string | null;
};

export type CategoryRow = {
  id: string;
  organization_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type ShelfRow = {
  id: string;
  label: string | null;
  organization_id: string;
};

/**
 * Borrowers are public-facing readers identified by phone within an organization.
 * They are upserted automatically when someone borrows a book through `/o/{slug}`,
 * so the admin never creates them manually.
 */
export type BorrowerRow = {
  id: string;
  organization_id: string;
  phone: string;
  display_name: string;
  email: string | null;
  last_active_at: string | null;
  /** Timestamp of the most recent privacy consent acceptance during a borrow. */
  consent_at: string | null;
  created_at: string;
};

export type BorrowRecordRow = {
  id: string;
  book_id: string;
  borrower_id: string;
  borrowed_at: string;
  returned_at: string | null;
  organization_id: string;
  location_note: string | null;
};

export type OrgStatus = "pending" | "approved" | "rejected" | "suspended";

export type OrgPlan = "free" | "pro" | "plus";

export type OrganizationRow = {
  id: string;
  name: string;
  city: string;
  contact_email: string;
  contact_phone: string;
  status: OrgStatus;
  owner_user_id: string | null;
  rejected_reason: string | null;
  created_at: string;
  approved_at: string | null;
  /** URL-safe identifier used for the public borrow/return entry: `/o/{public_slug}`. */
  public_slug: string;
  public_borrow_enabled: boolean;
  public_catalog_enabled: boolean;
  /** Subscription plan tier. Quotas live in `lib/plans.ts`. */
  plan: OrgPlan;
  /**
   * Super-admin granted exemption from quota enforcement. When `true`, the org
   * is never blocked by recognize/book quotas regardless of the global
   * `BILLING_QUOTA_ENFORCED` env flag. See `lib/billing/flags.ts`.
   */
  bypass_quota: boolean;
};

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

/**
 * One row per organization (enforced via `unique(organization_id)`). Holds the
 * current/last subscription state regardless of which gateway issued it.
 * All writes go through service role (server actions / API routes).
 */
export type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan: Exclude<OrgPlan, "free">;
  status: SubscriptionStatus;
  gateway: string;
  gateway_sub_id: string;
  /** First time the org ever subscribed. Never changes on renew. */
  started_at: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentStatus = "succeeded" | "failed" | "refunded";

export type PaymentRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  gateway: string;
  gateway_payment_id: string | null;
  amount: number;
  status: PaymentStatus;
  period_start: string | null;
  period_end: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
};

export type AuditActorRole = "super_admin" | "unit" | "system";

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_role: AuditActorRole;
  action: string;
  target_org_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type ProfileRole = "unit" | "super_admin";

export type ProfileRow = {
  id: string;
  organization_id: string | null;
  role: ProfileRole;
  created_at: string;
};
