import Link from "next/link";
import { notFound } from "next/navigation";
import SuperAdminShell from "@/components/SuperAdminShell";
import { getIssueReportDetail } from "@/lib/super-admin/org-data";
import {
  issueReportCategoryLabel,
  issueReportStatusMeta,
} from "@/lib/issue-report";
import type { IssueReportCategory } from "@/lib/issue-report";
import type { IssueReportReplyRow } from "@/lib/supabase/types";
import IssueReportActions from "./IssueReportActions";

type Params = Promise<{ reportId: string }>;

export default async function IssueReportDetailPage({
  params,
}: {
  params: Params;
}) {
  const { reportId } = await params;
  const ctx = await getIssueReportDetail(reportId);
  if (!ctx) notFound();

  const { report, org, replies } = ctx;
  const statusMeta = issueReportStatusMeta(report.status);
  const categoryLabel = issueReportCategoryLabel(
    report.category as IssueReportCategory,
  );

  return (
    <SuperAdminShell
      backHref="/super-admin/issue-reports"
      topbarTitle={categoryLabel}
      contentWidth="wide"
    >
      <div className="space-y-6">
        <section className="bg-white border border-neutral-200 rounded-2xl p-5 md:p-6">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/super-admin/organizations/${org.id}`}
              className="text-sm font-semibold text-neutral-900 hover:underline"
            >
              {org.name}
            </Link>
            <span
              className={`inline-flex items-center h-[24px] text-xs px-2 rounded-full border font-medium ${statusMeta.pillClass}`}
            >
              {statusMeta.label}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
              {categoryLabel}
            </span>
            <time className="ml-auto text-xs text-neutral-400 tabular-nums">
              {new Date(report.created_at).toLocaleString("zh-TW")}
            </time>
          </div>

          <p className="mt-4 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
            {report.reason}
          </p>

          <dl className="mt-5 pt-4 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-[6rem_1fr] gap-y-2 gap-x-4 text-xs">
            <dt className="text-neutral-400">回報人</dt>
            <dd className="text-neutral-800 break-all">
              {report.reporter_email ?? (
                <span className="text-neutral-400">（未提供，無法直接回信）</span>
              )}
            </dd>
            {report.page_url && (
              <>
                <dt className="text-neutral-400">頁面</dt>
                <dd className="text-neutral-800 break-all">{report.page_url}</dd>
              </>
            )}
            {report.status === "resolved" && report.resolved_at && (
              <>
                <dt className="text-neutral-400">處理時間</dt>
                <dd className="text-neutral-800 tabular-nums">
                  {new Date(report.resolved_at).toLocaleString("zh-TW")}
                </dd>
              </>
            )}
          </dl>
        </section>

        <IssueReportActions
          reportId={report.id}
          initialStatus={report.status}
          initialNote={report.admin_note ?? ""}
          reporterEmail={report.reporter_email}
        />

        <section className="bg-white border border-neutral-200 rounded-2xl p-5 md:p-6">
          <h2 className="text-sm font-medium text-neutral-900">
            回覆紀錄（{replies.length}）
          </h2>
          {replies.length === 0 ? (
            <p className="mt-4 py-8 text-center text-sm text-neutral-400">
              尚未回覆
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {replies.map((r) => (
                <ReplyItem key={r.id} reply={r} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </SuperAdminShell>
  );
}

function ReplyItem({ reply }: { reply: IssueReportReplyRow }) {
  return (
    <li className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <EmailStatusBadge status={reply.email_status} />
        <time className="text-xs text-neutral-400 tabular-nums">
          {new Date(reply.created_at).toLocaleString("zh-TW")}
        </time>
      </div>
      <p className="mt-3 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
        {reply.body}
      </p>
      {reply.email_status === "failed" && reply.email_error && (
        <p className="mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700 break-all">
          寄信失敗：{reply.email_error}
        </p>
      )}
    </li>
  );
}

function EmailStatusBadge({
  status,
}: {
  status: IssueReportReplyRow["email_status"];
}) {
  const map: Record<
    IssueReportReplyRow["email_status"],
    { label: string; cls: string }
  > = {
    sent: {
      label: "已寄出",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-100",
    },
    pending: {
      label: "寄送中",
      cls: "bg-amber-50 text-amber-700 border-amber-100",
    },
    failed: {
      label: "寄信失敗",
      cls: "bg-red-50 text-red-700 border-red-100",
    },
    skipped: {
      label: "未寄信",
      cls: "bg-neutral-100 text-neutral-600 border-neutral-200",
    },
  };
  const meta = map[status];
  return (
    <span
      className={`inline-flex items-center h-[22px] text-xs px-2 rounded-full border font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
