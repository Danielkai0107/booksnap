import Link from "next/link";
import type { IssueReportRow } from "@/lib/supabase/types";
import {
  issueReportCategoryLabel,
  issueReportStatusMeta,
} from "@/lib/issue-report";
import type { IssueReportCategory } from "@/lib/issue-report";

export default function OrgIssueReportsList({
  reports,
}: {
  reports: IssueReportRow[];
}) {
  if (reports.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">
        尚無問題回報（新回報會同步顯示於此）
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {reports.map((r) => {
        const statusMeta = issueReportStatusMeta(r.status);
        return (
          <li
            key={r.id}
            className="bg-white border border-neutral-200 rounded-xl"
          >
            <Link
              href={`/super-admin/issue-reports/${r.id}`}
              className="block p-4 hover:bg-neutral-50 transition rounded-xl"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center h-[22px] text-xs px-2 rounded-full border font-medium ${statusMeta.pillClass}`}
                  >
                    {statusMeta.label}
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                    {issueReportCategoryLabel(r.category as IssueReportCategory)}
                  </span>
                </div>
                <time className="text-xs text-neutral-400 tabular-nums">
                  {new Date(r.created_at).toLocaleString("zh-TW")}
                </time>
              </div>
              <p className="mt-2 text-sm text-neutral-800 line-clamp-2 whitespace-pre-wrap">
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
  );
}
