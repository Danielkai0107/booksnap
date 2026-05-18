import Link from "next/link";
import { notFound } from "next/navigation";
import SuperAdminShell from "@/components/SuperAdminShell";
import OrgDetailStats from "@/components/super-admin/OrgDetailStats";
import OrgDetailTabs, { type TabKey } from "@/components/super-admin/OrgDetailTabs";
import OrgBooksTable from "@/components/super-admin/OrgBooksTable";
import OrgBorrowersTable from "@/components/super-admin/OrgBorrowersTable";
import OrgIssueReportsList from "@/components/super-admin/OrgIssueReportsList";
import {
  getOrgDetailContext,
  listOrgBooks,
  listOrgBorrowers,
  listOrgIssueReports,
} from "@/lib/super-admin/org-data";
import type { OrgStatus } from "@/lib/supabase/types";
import { EXPERIENCE_TAG_CLASS, PLAN_META, effectivePlan } from "@/lib/plans";
import { trialState } from "@/lib/billing/lock";
import OrgRowActions from "../OrgRowActions";

type Search = Promise<{ tab?: string }>;

function statusLabel(s: OrgStatus): string {
  return s === "pending"
    ? "待審核"
    : s === "approved"
      ? "已通過"
      : s === "rejected"
        ? "已退回"
        : "已停用";
}

function statusPillClass(s: OrgStatus): string {
  return s === "pending"
    ? "bg-amber-50 text-amber-700 border-amber-100"
    : s === "approved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : s === "rejected"
        ? "bg-red-50 text-red-700 border-red-100"
        : "bg-neutral-100 text-neutral-600 border-neutral-200";
}

export default async function OrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Search;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const tab = (
    ["overview", "books", "borrowers", "reports"].includes(sp.tab ?? "")
      ? sp.tab
      : "overview"
  ) as TabKey;

  const ctx = await getOrgDetailContext(orgId);
  if (!ctx) notFound();

  const { org, subscription, usage } = ctx;
  const state = trialState(org, subscription);
  const ePlan = effectivePlan(org, subscription);
  const planPillLabel =
    state === "active_trial" && typeof ctx.trialDaysRemaining === "number"
      ? `體驗剩 ${ctx.trialDaysRemaining} 天`
      : state === "expired_trial"
        ? "體驗已結束"
        : PLAN_META[ePlan].label;
  const planPillClass =
    state === "active_trial" || state === "expired_trial"
      ? EXPERIENCE_TAG_CLASS
      : PLAN_META[ePlan].pillClass;

  const [books, borrowers, reports] = await Promise.all([
    tab === "books" || tab === "overview" ? listOrgBooks(orgId) : [],
    tab === "borrowers" || tab === "overview"
      ? listOrgBorrowers(orgId)
      : [],
    listOrgIssueReports(orgId),
  ]);

  const baseHref = `/super-admin/organizations/${orgId}`;

  return (
    <SuperAdminShell
      backHref="/super-admin/organizations"
      topbarTitle={org.name}
      contentWidth="wide"
    >
      <div className="w-full space-y-6">
        <section className="bg-white border border-neutral-200 rounded-2xl p-5 md:p-6 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center h-[26px] text-xs px-2.5 rounded-full border font-medium ${statusPillClass(org.status)}`}
            >
              {statusLabel(org.status)}
            </span>
            <span
              className={`inline-flex items-center h-[26px] text-xs px-2.5 rounded-full border font-medium ${planPillClass}`}
            >
              {planPillLabel}
            </span>
            {org.bypass_quota && (
              <span className="inline-flex items-center h-[26px] text-xs px-2.5 rounded-full border font-medium bg-indigo-50 text-indigo-700 border-indigo-100">
                免鎖
              </span>
            )}
            {ctx.locked && (
              <span className="inline-flex items-center h-[26px] text-xs px-2.5 rounded-full border font-medium bg-amber-50 text-amber-700 border-amber-100">
                已鎖定
              </span>
            )}
          </div>
          <dl className="mt-4 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-x-10 sm:gap-y-3">
            <InfoRow k="縣市" v={org.city} />
            <InfoRow k="Email" v={org.contact_email} />
            <InfoRow k="聯絡電話" v={org.contact_phone} />
            <InfoRow k="公開連結" v={`/o/${org.public_slug}`} />
            {org.approved_at && (
              <InfoRow
                k="核准時間"
                v={new Date(org.approved_at).toLocaleString("zh-TW")}
              />
            )}
          </dl>
          <div className="mt-6 pt-5 border-t border-neutral-100">
            <OrgRowActions
              orgId={org.id}
              orgName={org.name}
              status={org.status}
              plan={org.plan}
              trialState={state}
              trialEndsAt={org.trial_ends_at}
              city={org.city}
              contactEmail={org.contact_email}
              contactPhone={org.contact_phone}
              bypassQuota={org.bypass_quota}
              variant="expanded"
            />
          </div>
        </section>

        <OrgDetailStats
          aiUsed={usage.aiUsed}
          periodStart={usage.periodStart}
          periodEnd={usage.periodEnd}
          bookCount={usage.bookCount}
          borrowerCount={usage.borrowerCount}
          reportCount={reports.length}
        />

        <section className="bg-white border border-neutral-200 rounded-2xl p-5 md:p-6 w-full">
          <OrgDetailTabs baseHref={baseHref} active={tab} />
          <div className="mt-6">
            {tab === "overview" && (
              <OverviewPanel
                orgId={orgId}
                books={books}
                borrowers={borrowers}
                reports={reports}
              />
            )}
            {tab === "books" && <OrgBooksTable orgId={orgId} books={books} />}
            {tab === "borrowers" && (
              <OrgBorrowersTable orgId={orgId} borrowers={borrowers} />
            )}
            {tab === "reports" && <OrgIssueReportsList reports={reports} />}
          </div>
        </section>
      </div>
    </SuperAdminShell>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-x-3 items-baseline min-w-0">
      <dt className="text-xs text-neutral-400 shrink-0">{k}</dt>
      <dd className="text-sm text-neutral-800 break-all min-w-0">{v}</dd>
    </div>
  );
}

function OverviewPanel({
  orgId,
  books,
  borrowers,
  reports,
}: {
  orgId: string;
  books: Awaited<ReturnType<typeof listOrgBooks>>;
  borrowers: Awaited<ReturnType<typeof listOrgBorrowers>>;
  reports: Awaited<ReturnType<typeof listOrgIssueReports>>;
}) {
  return (
    <div className="space-y-6">
      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-900">最近入庫</h2>
          <Link
            href={`/super-admin/organizations/${orgId}?tab=books`}
            className="text-xs text-neutral-500 hover:text-neutral-900"
          >
            查看全部
          </Link>
        </div>
        <OrgBooksTable orgId={orgId} books={books.slice(0, 5)} />
      </section>
      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-900">出借人</h2>
          <Link
            href={`/super-admin/organizations/${orgId}?tab=borrowers`}
            className="text-xs text-neutral-500 hover:text-neutral-900"
          >
            查看全部
          </Link>
        </div>
        <OrgBorrowersTable orgId={orgId} borrowers={borrowers.slice(0, 5)} />
      </section>
      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-900">問題回報</h2>
          <Link
            href={`/super-admin/organizations/${orgId}?tab=reports`}
            className="text-xs text-neutral-500 hover:text-neutral-900"
          >
            查看全部
          </Link>
        </div>
        <OrgIssueReportsList reports={reports.slice(0, 3)} />
      </section>
    </div>
  );
}
