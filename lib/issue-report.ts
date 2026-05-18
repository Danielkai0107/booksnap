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
