/** 單位端問題回報類別（value 存 API，label 顯示於 UI／信件）。 */
export const ISSUE_REPORT_CATEGORIES = [
  { value: "bug", label: "功能異常" },
  { value: "billing", label: "帳號與訂閱" },
  { value: "checkin", label: "新書入庫／辨識" },
  { value: "public_link", label: "借閱連結" },
  { value: "other", label: "其他" },
] as const;

export type IssueReportCategory =
  (typeof ISSUE_REPORT_CATEGORIES)[number]["value"];

const CATEGORY_SET = new Set<string>(
  ISSUE_REPORT_CATEGORIES.map((c) => c.value),
);

export function isIssueReportCategory(v: string): v is IssueReportCategory {
  return CATEGORY_SET.has(v);
}

export function issueReportCategoryLabel(
  value: IssueReportCategory,
): string {
  return (
    ISSUE_REPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value
  );
}

export const ISSUE_REPORT_REASON_MAX = 2000;
export const ISSUE_REPORT_REASON_MIN = 10;

export const ISSUE_REPORT_NOTE_MAX = 4000;
export const ISSUE_REPORT_REPLY_MIN = 1;
export const ISSUE_REPORT_REPLY_MAX = 4000;

/** 處理狀態的中文 label / pill 樣式，UI 兩邊共用。 */
export const ISSUE_REPORT_STATUSES = [
  {
    value: "open",
    label: "待處理",
    pillClass: "bg-amber-50 text-amber-700 border-amber-100",
  },
  {
    value: "in_progress",
    label: "處理中",
    pillClass: "bg-blue-50 text-blue-700 border-blue-100",
  },
  {
    value: "resolved",
    label: "已處理",
    pillClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
] as const;

export type IssueReportStatusValue =
  (typeof ISSUE_REPORT_STATUSES)[number]["value"];

const STATUS_SET = new Set<string>(
  ISSUE_REPORT_STATUSES.map((s) => s.value),
);

export function isIssueReportStatus(v: string): v is IssueReportStatusValue {
  return STATUS_SET.has(v);
}

export function issueReportStatusMeta(value: IssueReportStatusValue) {
  return (
    ISSUE_REPORT_STATUSES.find((s) => s.value === value) ??
    ISSUE_REPORT_STATUSES[0]
  );
}
