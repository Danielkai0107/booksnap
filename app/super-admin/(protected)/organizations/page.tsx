import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  OrganizationRow,
  OrgStatus,
  SubscriptionRow,
  SubscriptionStatus,
} from "@/lib/supabase/types";
import {
  PLAN_META,
  PLAN_QUOTAS,
  effectivePlan,
  getOrgPeriod,
} from "@/lib/plans";
import OrgRowActions from "./OrgRowActions";

type TabKey = "pending" | "approved" | "rejected" | "suspended" | "all";

type Search = Promise<{ tab?: string }>;

const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "待審核" },
  { key: "approved", label: "已通過" },
  { key: "rejected", label: "已退回" },
  { key: "suspended", label: "已停用" },
  { key: "all", label: "全部" },
];

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

function subscriptionStatusPillClass(s: SubscriptionStatus): string {
  if (s === "active") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }
  if (s === "past_due") {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }
  if (s === "cancelled") {
    return "bg-orange-50 text-orange-700 border-orange-100";
  }
  if (s === "expired") {
    return "bg-neutral-100 text-neutral-500 border-neutral-200";
  }
  return "bg-blue-50 text-blue-700 border-blue-100";
}

function subscriptionStatusLabel(s: SubscriptionStatus): string {
  return {
    pending: "處理中",
    active: "進行中",
    past_due: "扣款失敗",
    cancelled: "已取消",
    expired: "已過期",
  }[s];
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const tab = (sp.tab as TabKey) ?? "pending";

  const admin = createAdminClient();
  let query = admin
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });
  if (tab !== "all") {
    query = query.eq("status", tab);
  }
  const { data, error } = await query;
  const orgs = (data ?? []) as OrganizationRow[];

  // 撈訂閱資訊，後續用來決定 effective plan / billing-anchored period
  const orgIds = orgs.map((o) => o.id);
  const { data: subsRaw } =
    orgIds.length === 0
      ? { data: [] }
      : await admin
          .from("subscriptions")
          .select("*")
          .in("organization_id", orgIds);
  const subByOrgId = new Map<string, SubscriptionRow>();
  ((subsRaw ?? []) as SubscriptionRow[]).forEach((s) =>
    subByOrgId.set(s.organization_id, s),
  );

  // 本期 AI 用量：以訂閱期或啟用日當錨點。一次撈出所有 (organization_id, created_at)
  // 再前端 per-org 過濾聚合，避免 N 次 round trip。
  const { data: aiRows } = await admin
    .from("ai_usage_logs")
    .select("organization_id, created_at");
  const aiUsedByOrg = new Map<string, number>();
  const now = new Date();
  for (const o of orgs) {
    const sub = subByOrgId.get(o.id) ?? null;
    const { start } = getOrgPeriod(o, sub, now);
    const startMs = start.getTime();
    const count = (aiRows ?? []).reduce((acc, r) => {
      const row = r as { organization_id: string; created_at: string };
      if (row.organization_id !== o.id) return acc;
      return new Date(row.created_at).getTime() >= startMs ? acc + 1 : acc;
    }, 0);
    aiUsedByOrg.set(o.id, count);
  }

  // 館藏冊數：以 organization_id 群組計數一次撈完
  const { data: bookRows } = await admin
    .from("books")
    .select("organization_id");
  const bookCountByOrg = new Map<string, number>();
  (bookRows ?? []).forEach((r) => {
    const id = (r as { organization_id: string }).organization_id;
    bookCountByOrg.set(id, (bookCountByOrg.get(id) ?? 0) + 1);
  });

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
        單位管理
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        審核、停用、重設單位密碼。
      </p>

      <div className="mt-6 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/super-admin/organizations?tab=${t.key}`}
              className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
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

      {error && (
        <div className="mt-6 px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
          {error.message}
        </div>
      )}

      {orgs.length === 0 ? (
        <p className="mt-12 text-center text-sm text-neutral-500">
          此分類目前沒有單位
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {orgs.map((o) => {
            const sub = subByOrgId.get(o.id) ?? null;
            const ePlan = effectivePlan(o, sub);
            return (
            <li
              key={o.id}
              className="bg-white border border-neutral-200 rounded-2xl p-5"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-neutral-900">
                      {o.name}
                    </h2>
                    <span
                      className={`inline-flex items-center h-[26px] text-xs px-2.5 rounded-full border font-medium ${statusPillClass(
                        o.status
                      )}`}
                    >
                      {statusLabel(o.status)}
                    </span>
                    <span
                      className={`inline-flex items-center h-[26px] text-xs px-2.5 rounded-full border font-medium ${PLAN_META[ePlan].pillClass}`}
                    >
                      {PLAN_META[ePlan].label}
                    </span>
                    {sub && (
                      <span
                        className={`inline-flex items-center h-[26px] text-xs px-2.5 rounded-full border font-medium ${subscriptionStatusPillClass(sub.status)}`}
                      >
                        {subscriptionStatusLabel(sub.status)}
                      </span>
                    )}
                    {sub?.cancel_at_period_end && sub.status === "active" && (
                      <span className="inline-flex items-center h-[26px] text-xs px-2.5 rounded-full border font-medium bg-amber-50 text-amber-700 border-amber-100">
                        期末取消
                      </span>
                    )}
                    {o.bypass_quota && (
                      <span className="inline-flex items-center h-[26px] text-xs px-2.5 rounded-full border font-medium bg-indigo-50 text-indigo-700 border-indigo-100">
                        免配額
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 text-sm text-neutral-600 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    <Pair k="縣市" v={o.city} />
                    <Pair k="Email" v={o.contact_email} />
                    <Pair k="聯絡電話" v={o.contact_phone} />
                    <Pair
                      k="送出時間"
                      v={new Date(o.created_at).toLocaleString("zh-TW")}
                    />
                    {o.approved_at && (
                      <Pair
                        k="核准時間"
                        v={new Date(o.approved_at).toLocaleString("zh-TW")}
                      />
                    )}
                    {sub && (
                      <Pair
                        k="本期"
                        v={`${new Date(sub.current_period_start).toLocaleDateString("zh-TW")} ~ ${new Date(sub.current_period_end).toLocaleDateString("zh-TW")}`}
                      />
                    )}
                    {o.rejected_reason && (
                      <Pair k="退回原因" v={o.rejected_reason} />
                    )}
                    <Pair
                      k="本期 AI 用量"
                      v={`${(aiUsedByOrg.get(o.id) ?? 0).toLocaleString()} / ${PLAN_QUOTAS[ePlan].ai.toLocaleString()} 次`}
                    />
                    <Pair
                      k="館藏冊數"
                      v={`${(bookCountByOrg.get(o.id) ?? 0).toLocaleString()} / ${PLAN_QUOTAS[ePlan].books.toLocaleString()} 冊`}
                    />
                  </dl>
                </div>
                <OrgRowActions
                  orgId={o.id}
                  orgName={o.name}
                  status={o.status}
                  plan={o.plan}
                  city={o.city}
                  contactEmail={o.contact_email}
                  contactPhone={o.contact_phone}
                  bypassQuota={o.bypass_quota}
                />
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-xs text-neutral-400">{k}</dt>
      <dd className="text-neutral-800 break-all">{v}</dd>
    </>
  );
}
