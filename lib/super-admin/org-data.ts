import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BookRow,
  BorrowerRow,
  BorrowRecordRow,
  IssueReportReplyRow,
  IssueReportRow,
  OrganizationRow,
  SubscriptionRow,
} from "@/lib/supabase/types";
import {
  effectivePlan,
  getOrgPeriod,
  type OrgPlan,
} from "@/lib/plans";
import { maybeExpireSubscription } from "@/lib/billing/expire";
import {
  isOrgLocked,
  trialDaysRemaining,
  trialState,
  type TrialState,
} from "@/lib/billing/lock";

export type OrgUsageStats = {
  aiUsed: number;
  periodStart: string;
  periodEnd: string;
  bookCount: number;
  borrowerCount: number;
};

export type OrgDetailContext = {
  org: OrganizationRow;
  subscription: SubscriptionRow | null;
  plan: OrgPlan;
  trialState: TrialState;
  trialDaysRemaining: number | null;
  locked: boolean;
  usage: OrgUsageStats;
};

export async function getOrganizationOrNull(
  orgId: string,
): Promise<OrganizationRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  return (data as OrganizationRow | null) ?? null;
}

export async function getOrgDetailContext(
  orgId: string,
): Promise<OrgDetailContext | null> {
  const org = await getOrganizationOrNull(orgId);
  if (!org) return null;

  const admin = createAdminClient();
  const subscription = await maybeExpireSubscription(org.id, admin);
  const plan = effectivePlan(org, subscription);
  const state = trialState(org, subscription);
  const { start, end } = getOrgPeriod(org, subscription);

  const [aiRes, booksRes, borrowersRes] = await Promise.all([
    admin
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .gte("created_at", start.toISOString()),
    admin
      .from("books")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id),
    admin
      .from("borrowers")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id),
  ]);

  return {
    org,
    subscription,
    plan,
    trialState: state,
    trialDaysRemaining: trialDaysRemaining(org),
    locked: isOrgLocked(org, subscription),
    usage: {
      aiUsed: aiRes.count ?? 0,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      bookCount: booksRes.count ?? 0,
      borrowerCount: borrowersRes.count ?? 0,
    },
  };
}

export async function listOrgBooks(orgId: string): Promise<BookRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("books")
    .select("*")
    .eq("organization_id", orgId)
    .order("checkin_time", { ascending: false });
  return (data ?? []) as BookRow[];
}

export type BorrowerWithHolding = BorrowerRow & { holding_count: number };

export async function listOrgBorrowers(
  orgId: string,
): Promise<BorrowerWithHolding[]> {
  const admin = createAdminClient();
  const [borrowersRes, holdingsRes] = await Promise.all([
    admin
      .from("borrowers")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    admin
      .from("books")
      .select("current_holder_id")
      .eq("organization_id", orgId)
      .not("current_holder_id", "is", null),
  ]);

  const holdingCounts = new Map<string, number>();
  for (const row of holdingsRes.data ?? []) {
    const id = (row as { current_holder_id: string | null }).current_holder_id;
    if (!id) continue;
    holdingCounts.set(id, (holdingCounts.get(id) ?? 0) + 1);
  }

  return ((borrowersRes.data ?? []) as BorrowerRow[]).map((b) => ({
    ...b,
    holding_count: holdingCounts.get(b.id) ?? 0,
  }));
}

export async function listOrgIssueReports(
  orgId: string,
): Promise<IssueReportRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("issue_reports")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []) as IssueReportRow[];
}

export type IssueReportListItem = IssueReportRow & {
  org_name: string;
  reply_count: number;
};

export async function listAllIssueReports(
  status?: "open" | "in_progress" | "resolved",
): Promise<IssueReportListItem[]> {
  const admin = createAdminClient();
  let query = admin
    .from("issue_reports")
    .select("*, organization:organizations(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) {
    query = query.eq("status", status);
  }
  const { data } = await query;

  const rows = (data ?? []) as Array<
    IssueReportRow & { organization: { name: string } | null }
  >;

  const replyCounts = await loadReplyCounts(rows.map((r) => r.id));

  return rows.map((row) => ({
    ...row,
    org_name: row.organization?.name ?? "（已刪除）",
    reply_count: replyCounts.get(row.id) ?? 0,
  }));
}

async function loadReplyCounts(
  reportIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (reportIds.length === 0) return counts;
  const admin = createAdminClient();
  const { data } = await admin
    .from("issue_report_replies")
    .select("issue_report_id")
    .in("issue_report_id", reportIds);
  for (const row of (data ?? []) as Array<{ issue_report_id: string }>) {
    counts.set(
      row.issue_report_id,
      (counts.get(row.issue_report_id) ?? 0) + 1,
    );
  }
  return counts;
}

export type IssueReportDetailContext = {
  report: IssueReportRow;
  org: Pick<OrganizationRow, "id" | "name" | "contact_email">;
  replies: IssueReportReplyRow[];
};

export async function getIssueReportDetail(
  reportId: string,
): Promise<IssueReportDetailContext | null> {
  const admin = createAdminClient();
  const { data: reportRow } = await admin
    .from("issue_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (!reportRow) return null;
  const report = reportRow as IssueReportRow;

  const [orgRes, repliesRes] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, contact_email")
      .eq("id", report.organization_id)
      .maybeSingle(),
    admin
      .from("issue_report_replies")
      .select("*")
      .eq("issue_report_id", report.id)
      .order("created_at", { ascending: true }),
  ]);

  return {
    report,
    org: (orgRes.data ?? {
      id: report.organization_id,
      name: "（已刪除）",
      contact_email: "",
    }) as Pick<OrganizationRow, "id" | "name" | "contact_email">,
    replies: (repliesRes.data ?? []) as IssueReportReplyRow[],
  };
}

export type BookDetailData = {
  book: BookRow;
  records: Array<
    BorrowRecordRow & {
      borrower: { id: string; display_name: string; phone: string } | null;
    }
  >;
  categories: Array<{ id: string; name: string }>;
};

export async function getOrgBookDetail(
  orgId: string,
  bookId: string,
): Promise<BookDetailData | null> {
  const admin = createAdminClient();
  const [bookRes, recordsRes, categoriesRes] = await Promise.all([
    admin
      .from("books")
      .select("*")
      .eq("organization_id", orgId)
      .eq("book_id", bookId)
      .maybeSingle(),
    admin
      .from("borrow_records")
      .select(
        "id, book_id, borrower_id, borrowed_at, returned_at, location_note, organization_id, borrower:borrowers(id, display_name, phone)",
      )
      .eq("organization_id", orgId)
      .eq("book_id", bookId)
      .order("borrowed_at", { ascending: false }),
    admin
      .from("categories")
      .select("id, name")
      .eq("organization_id", orgId),
  ]);

  if (!bookRes.data) return null;

  const records = ((recordsRes.data ?? []) as unknown[]).map((row) => {
    const r = row as BorrowRecordRow & {
      borrower:
        | { id: string; display_name: string; phone: string }
        | { id: string; display_name: string; phone: string }[]
        | null;
    };
    const borrower = Array.isArray(r.borrower) ? (r.borrower[0] ?? null) : r.borrower;
    return { ...r, borrower };
  });

  return {
    book: bookRes.data as BookRow,
    records,
    categories: (categoriesRes.data ?? []) as Array<{ id: string; name: string }>,
  };
}

export type BorrowerDetailData = {
  borrower: BorrowerRow;
  holding: Array<{
    book_id: string;
    title: string;
    image_url: string | null;
    current_location: string | null;
  }>;
  records: BorrowRecordRow[];
  books: Record<
    string,
    {
      book_id: string;
      title: string;
      image_url: string | null;
    }
  >;
};

export async function getOrgBorrowerDetail(
  orgId: string,
  borrowerId: string,
): Promise<BorrowerDetailData | null> {
  const admin = createAdminClient();
  const [borrowerRes, holdingRes, recordsRes] = await Promise.all([
    admin
      .from("borrowers")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", borrowerId)
      .maybeSingle(),
    admin
      .from("books")
      .select("book_id, title, image_url, current_location")
      .eq("organization_id", orgId)
      .eq("current_holder_id", borrowerId),
    admin
      .from("borrow_records")
      .select("*")
      .eq("organization_id", orgId)
      .eq("borrower_id", borrowerId)
      .order("borrowed_at", { ascending: false }),
  ]);

  if (!borrowerRes.data) return null;

  const records = (recordsRes.data ?? []) as BorrowRecordRow[];
  const bookIds = Array.from(new Set(records.map((r) => r.book_id)));

  let books: BorrowerDetailData["books"] = {};
  if (bookIds.length > 0) {
    const { data: bookRows } = await admin
      .from("books")
      .select("book_id, title, image_url")
      .eq("organization_id", orgId)
      .in("book_id", bookIds);
    for (const b of bookRows ?? []) {
      const row = b as { book_id: string; title: string; image_url: string | null };
      books[row.book_id] = row;
    }
  }

  return {
    borrower: borrowerRes.data as BorrowerRow,
    holding: (holdingRes.data ?? []) as BorrowerDetailData["holding"],
    records,
    books,
  };
}
