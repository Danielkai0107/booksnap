import Link from "next/link";
import SuperAdminShell from "@/components/SuperAdminShell";
import { listAllIssueReports } from "@/lib/super-admin/org-data";
import {
  issueReportCategoryLabel,
  issueReportStatusMeta,
} from "@/lib/issue-report";
import type {
  IssueReportCategory,
  IssueReportStatusValue,
} from "@/lib/issue-report";

type StatusFilter = IssueReportStatusValue | "all";

type Search = Promise<{ status?: string }>;

const TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "open", label: "待處理" },
  { key: "in_progress", label: "處理中" },
  { key: "resolved", label: "已處理" },
];

function isStatusFilter(v: string): v is StatusFilter {
  return v === "all" || v === "open" || v === "in_progress" || v === "resolved";
}

export default async function IssueReportsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const raw = sp.status ?? "all";
  const tab: StatusFilter = isStatusFilter(raw) ? raw : "all";

  const reports = await listAllIssueReports(tab === "all" ? undefined : tab);

  return (
    <SuperAdminShell>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
        問題回報
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        各單位從後台送出的問題回報。點任一筆可進入處理頁回覆並標記狀態。
      </p>

      <div className="mt-6 flex gap-1 border-b border-neutral-200 overflow-x-auto">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={
                t.key === "all"
                  ? "/super-admin/issue-reports"
                  : `/super-admin/issue-reports?status=${t.key}`
              }
              className={`shrink-0 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
                active
                  ? "text-neutral-900 border-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900 border-transparent"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {reports.length === 0 ? (
        <p className="mt-12 text-center text-sm text-neutral-500">
          此分類目前沒有回報
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {reports.map((r) => {
            const statusMeta = issueReportStatusMeta(r.status);
            return (
              <li
                key={r.id}
                className="bg-white border border-neutral-200 rounded-2xl"
              >
                <Link
                  href={`/super-admin/issue-reports/${r.id}`}
                  className="block p-5 hover:bg-neutral-50 transition rounded-2xl"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold text-neutral-900 truncate max-w-[20rem]">
                        {r.org_name}
                      </span>
                      <span
                        className={`inline-flex items-center h-[24px] text-xs px-2 rounded-full border font-medium ${statusMeta.pillClass}`}
                      >
                        {statusMeta.label}
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                        {issueReportCategoryLabel(
                          r.category as IssueReportCategory,
                        )}
                      </span>
                      {r.reply_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                          <ReplyIcon />
                          {r.reply_count}
                        </span>
                      )}
                    </div>
                    <time className="text-xs text-neutral-400 tabular-nums shrink-0">
                      {new Date(r.created_at).toLocaleString("zh-TW")}
                    </time>
                  </div>
                  <p className="mt-3 text-sm text-neutral-700 line-clamp-2 whitespace-pre-wrap">
                    {r.reason}
                  </p>
                  {(r.reporter_email || r.page_url) && (
                    <dl className="mt-3 text-xs text-neutral-500 space-y-1">
                      {r.reporter_email && (
                        <div>
                          <span className="text-neutral-400">回報人 </span>
                          {r.reporter_email}
                        </div>
                      )}
                      {r.page_url && (
                        <div>
                          <span className="text-neutral-400">頁面 </span>
                          <span className="break-all">{r.page_url}</span>
                        </div>
                      )}
                    </dl>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SuperAdminShell>
  );
}

function ReplyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}
