import Link from "next/link";
import SuperAdminShell from "@/components/SuperAdminShell";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLAN_META,
  PLAN_ORDER,
  loadPlanConfigs,
  type OrgPlan,
} from "@/lib/plans";
import type { SubscriptionRow } from "@/lib/supabase/types";

export default async function SuperAdminDashboard() {
  const admin = createAdminClient();
  const [
    { data: orgs },
    { count: usersCount },
    { count: aiCount },
    { data: subsRaw },
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("status, plan")
      .order("created_at", { ascending: false }),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "unit"),
    admin
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true }),
    admin.from("subscriptions").select("*"),
  ]);
  const subs = (subsRaw ?? []) as SubscriptionRow[];
  const { prices } = await loadPlanConfigs(admin);

  const counts = {
    total: orgs?.length ?? 0,
    pending: orgs?.filter((o) => o.status === "pending").length ?? 0,
    approved: orgs?.filter((o) => o.status === "approved").length ?? 0,
    rejected: orgs?.filter((o) => o.status === "rejected").length ?? 0,
    suspended: orgs?.filter((o) => o.status === "suspended").length ?? 0,
  };

  // 方案分布只計入「已通過」的單位 — pending / rejected / suspended 的 plan 沒有實質意義。
  const approvedOrgs = (orgs ?? []).filter((o) => o.status === "approved");
  const planCounts: Record<OrgPlan, number> = { trial: 0, pro: 0 };
  for (const o of approvedOrgs) {
    const p = o.plan as OrgPlan | undefined;
    if (p && p in planCounts) planCounts[p] += 1;
  }

  // 訂閱統計：active / past_due 算「進行中」；MRR 用 active 訂閱的方案月費加總。
  // active 同時 cancel_at_period_end=true 仍視為進行中（本期還會扣款）。
  // 本月新增 / 取消數 用 started_at / cancelled_at 落在當月來判斷。
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  ).getTime();

  let mrr = 0;
  const subStatusCounts = {
    active: 0,
    past_due: 0,
    cancelled: 0,
    expired: 0,
    pending: 0,
  };
  let activePro = 0;
  let monthlyNew = 0;
  let monthlyCancelled = 0;
  for (const s of subs) {
    subStatusCounts[s.status] += 1;
    if (s.status === "active" || s.status === "past_due") {
      mrr += prices[s.plan].monthly;
      activePro += 1;
    }
    if (new Date(s.started_at).getTime() >= monthStart) {
      monthlyNew += 1;
    }
    if (s.cancelled_at && new Date(s.cancelled_at).getTime() >= monthStart) {
      monthlyCancelled += 1;
    }
  }

  return (
    <SuperAdminShell>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
        總覽
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        所有單位的整體狀態。
      </p>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="所有單位" value={counts.total} />
        <Stat label="待審核" value={counts.pending} accent="amber" />
        <Stat label="已通過" value={counts.approved} accent="emerald" />
        <Stat label="已退回" value={counts.rejected} />
        <Stat label="已停用" value={counts.suspended} />
      </div>

      <div className="mt-10 flex items-center justify-between p-5 border border-neutral-200 rounded-2xl bg-white">
        <div>
          <p className="text-sm font-medium text-neutral-900">單位審核</p>
          <p className="text-xs text-neutral-500 mt-1">
            目前有 <span className="font-medium text-amber-700">{counts.pending}</span> 個申請等待你審核
          </p>
        </div>
        <Link
          href="/super-admin/organizations?tab=pending"
          className="bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
        >
          前往審核
        </Link>
      </div>

      <div className="mt-10 p-5 border border-neutral-200 rounded-2xl bg-white">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-neutral-900">收入概況</p>
            <p className="mt-1 text-xs text-neutral-500">
              MRR ＝ 進行中訂閱方案月費加總（含 past_due）。
            </p>
          </div>
          <Link
            href="/super-admin/subscriptions"
            className="text-xs text-neutral-500 hover:text-neutral-900 transition"
          >
            查看訂閱列表 →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="MRR"
            value={mrr}
            format={(n) => `NT$ ${n.toLocaleString()}`}
            accent="emerald"
          />
          <Stat label="進行中" value={subStatusCounts.active} />
          <Stat label="本月新訂閱" value={monthlyNew} accent="emerald" />
          <Stat label="本月取消" value={monthlyCancelled} accent="amber" />
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Pro 進行中" value={activePro} />
          <Stat
            label="扣款失敗"
            value={subStatusCounts.past_due}
            accent="amber"
          />
          <Stat label="已過期" value={subStatusCounts.expired} />
        </div>
      </div>

      <div className="mt-10 p-5 border border-neutral-200 rounded-2xl bg-white">
        <p className="text-sm font-medium text-neutral-900">方案分布</p>
        <p className="mt-1 text-xs text-neutral-500">
          已通過的單位中，目前各方案的單位數。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {PLAN_ORDER.map((p) => {
            const meta = PLAN_META[p];
            return (
              <div
                key={p}
                className="border border-neutral-200 rounded-xl px-4 py-3"
              >
                <span
                  className={`inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium ${meta.pillClass}`}
                >
                  {meta.label}
                </span>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900">
                  {planCounts[p]}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-10 p-5 border border-neutral-200 rounded-2xl bg-white">
        <p className="text-sm font-medium text-neutral-900">AI 識別用量</p>
        <p className="mt-1 text-xs text-neutral-500">
          所有單位累計呼叫 Claude 識別書名的次數（消耗 token 的次數）。
        </p>
        <p className="mt-3 text-3xl font-semibold tabular-nums text-neutral-900">
          {(aiCount ?? 0).toLocaleString()}
          <span className="ml-1 text-sm font-normal text-neutral-500">次</span>
        </p>
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        登入單位數：{usersCount ?? 0}
      </p>
    </SuperAdminShell>
  );
}

function Stat({
  label,
  value,
  accent,
  format,
}: {
  label: string;
  value: number;
  accent?: "amber" | "emerald";
  format?: (n: number) => string;
}) {
  const accentClass =
    accent === "amber"
      ? "text-amber-700"
      : accent === "emerald"
      ? "text-emerald-700"
      : "text-neutral-900";
  return (
    <div className="border border-neutral-200 rounded-2xl bg-white px-4 py-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {format ? format(value) : value}
      </p>
    </div>
  );
}
