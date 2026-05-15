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
  current_holder: string | null;
  organization_id: string;
};

export type ShelfRow = {
  id: string;
  label: string | null;
  organization_id: string;
};

export type MemberRow = {
  id: string;
  name: string;
  created_at: string;
  organization_id: string;
};

export type BorrowRecordRow = {
  id: string;
  book_id: string;
  borrower_name: string;
  borrowed_at: string;
  returned_at: string | null;
  organization_id: string;
};

export type OrgStatus = "pending" | "approved" | "rejected" | "suspended";

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
};

export type ProfileRole = "unit" | "super_admin";

export type ProfileRow = {
  id: string;
  organization_id: string | null;
  role: ProfileRole;
  created_at: string;
};
