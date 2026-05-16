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
  /** Subscription plan tier. Quotas live in `lib/plans.ts` (v1: display only, no enforcement). */
  plan: OrgPlan;
};

export type ProfileRole = "unit" | "super_admin";

export type ProfileRow = {
  id: string;
  organization_id: string | null;
  role: ProfileRole;
  created_at: string;
};
