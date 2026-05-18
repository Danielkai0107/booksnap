import Link from "next/link";
import SuperAdminShell from "@/components/SuperAdminShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPlanConfigs } from "@/lib/plans";
import { trialDaysRemaining, trialState } from "@/lib/billing/lock";
import type { SubscriptionRow } from "@/lib/supabase/types";

/**
 * 體驗結束前多少天列入「將到期」追蹤名單。目的是給營運主動接觸的機會：
 * 體驗第 23–30 天的單位是最有效的升級轉換對象，太短會錯過、太長會稀釋。
 */
const TRIAL_ENDING_SOON_DAYS = 7;

type OrgSummaryRow = {
  id: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  plan: "trial" | "pro";
  trial_ends_at: string | null;
  created_at: string;
};

export default async function SuperAdminDashboard() {
  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  );
  const monthStartIso = monthStart.toISOString();

  // 並行抓需要的所有快照：org、subscription、profile 數、AI 用量（累計／本月／本月活躍單位）。
  // 「本月活躍單位」用拉 organization_id 列再 Set，目前資料量足夠，
  // 未來逼近 50k 筆再改成 RPC group-by。
  const [
    { data: orgRows },
    { count: usersCount },
    { count: aiCountAll },
    { count: aiCountMonth },
    { data: aiOrgRowsMonth },
    { data: subsRaw },
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id, status, plan, trial_ends_at, created_at"),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "unit"),
    admin
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true }),
    admin
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", monthStartIso),
    admin
      .from("ai_usage_logs")
      .select("organization_id")
      .gte("created_at", monthStartIso)
      .limit(50_000),
    admin.from("subscriptions").select("*"),
  ]);

  const orgs = (orgRows ?? []) as OrgSummaryRow[];
  const subs = (subsRaw ?? []) as SubscriptionRow[];
  const { prices } = await loadPlanConfigs(admin);

  const subByOrgId = new Map<string, SubscriptionRow>();
  for (const s of subs) subByOrgId.set(s.organization_id, s);

  // 單位概況：服務中 = approved；本月新增從 created_at；已停用 = suspended。
  // 註冊流程在 2026-05 之後就直接 approved，所以不會再有 pending / rejected。
  const approvedOrgs = orgs.filter((o) => o.status === "approved");
  const orgCounts = {
    approved: approvedOrgs.length,
    suspended: orgs.filter((o) => o.status === "suspended").length,
    newThisMonth: orgs.filter(
      (o) => new Date(o.created_at).getTime() >= monthStart.getTime(),
    ).length,
  };

  // 體驗轉換漏斗：對每個 approved org 用 trialState() 分類。
  // trialEndingSoon ⊂ activeTrial（會重複呈現，目的就是高亮「快過期了」這個子集）。
  const funnel = {
    activeTrial: 0,
    trialEndingSoon: 0,
    expiredTrial: 0,
    paid: 0,
    cancelledInPeriod: 0,
  };
  for (const o of approvedOrgs) {
    const sub = subByOrgId.get(o.id) ?? null;
    const state = trialState(o, sub, now);
    if (state === "active_trial") {
      funnel.activeTrial += 1;
      const daysLeft = trialDaysRemaining(o, now);
      if (daysLeft !== null && daysLeft <= TRIAL_ENDING_SOON_DAYS) {
        funnel.trialEndingSoon += 1;
      }
    } else if (state === "expired_trial") {
      funnel.expiredTrial += 1;
    } else if (state === "paid") {
      funnel.paid += 1;
    } else if (state === "cancelled_in_period") {
      funnel.cancelledInPeriod += 1;
    }
  }

  // 訂閱統計：active / past_due 算「進行中」；MRR 用進行中訂閱方案月費加總。
  // 本月新增 / 取消數用 started_at / cancelled_at 落在當月來判斷。
  let mrr = 0;
  let pastDueCount = 0;
  let monthlyNew = 0;
  let monthlyCancelled = 0;
  for (const s of subs) {
    if (s.status === "active" || s.status === "past_due") {
      mrr += prices[s.plan].monthly;
    }
    if (s.status === "past_due") pastDueCount += 1;
    if (new Date(s.started_at).getTime() >= monthStart.getTime()) {
      monthlyNew += 1;
    }
    if (
      s.cancelled_at &&
      new Date(s.cancelled_at).getTime() >= monthStart.getTime()
    ) {
      monthlyCancelled += 1;
    }
  }

  const activeAiOrgs = new Set(
    (aiOrgRowsMonth ?? []).map(
      (r) => (r as { organization_id: string }).organization_id,
    ),
  ).size;

  return (
    <SuperAdminShell>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
        總覽
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        單位健康度、體驗轉換、收入與用量一覽。
      </p>

      <Section>
        <SectionHeader title="單位概況" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="服務中" value={orgCounts.approved} accent="emerald" />
          <Stat label="本月新增" value={orgCounts.newThisMonth} />
          <Stat label="已停用" value={orgCounts.suspended} />
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="體驗轉換漏斗"
          hint="從體驗起算到付費 Pro 的當前分布。「將到期」是主動聯繫升級的最佳時機。"
          linkText="查看單位列表 →"
          linkHref="/super-admin/organizations?tab=approved"
        />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="體驗中" value={funnel.activeTrial} />
          <Stat
            label={`將到期（≤ ${TRIAL_ENDING_SOON_DAYS} 天）`}
            value={funnel.trialEndingSoon}
            accent="amber"
          />
          <Stat
            label="體驗已結束"
            value={funnel.expiredTrial}
            accent="amber"
          />
          <Stat label="Pro 進行中" value={funnel.paid} accent="emerald" />
        </div>
        {funnel.cancelledInPeriod > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            另有 <span className="font-medium text-neutral-700">{funnel.cancelledInPeriod}</span> 個 Pro 單位已取消、仍在本期內使用。
          </p>
        )}
      </Section>

      <Section>
        <SectionHeader
          title="收入概況"
          hint="MRR ＝ 進行中訂閱方案月費加總（含 past_due）。"
          linkText="查看訂閱列表 →"
          linkHref="/super-admin/subscriptions"
        />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="MRR"
            value={mrr}
            format={(n) => `NT$ ${n.toLocaleString()}`}
            accent="emerald"
          />
          <Stat label="本月新訂閱" value={monthlyNew} accent="emerald" />
          <Stat label="本月取消" value={monthlyCancelled} accent="amber" />
          <Stat label="扣款失敗" value={pastDueCount} accent="amber" />
        </div>
      </Section>

      <Section>
        <SectionHeader
          title="AI 識別用量"
          hint="所有單位呼叫 Claude 智能辨識（書封 OCR）的次數。"
          linkText="查看 Token 用量 →"
          linkHref="/super-admin/tokens?range=this_month"
        />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="本月呼叫" value={aiCountMonth ?? 0} accent="emerald" />
          <Stat label="本月活躍單位" value={activeAiOrgs} />
          <Stat label="累計呼叫" value={aiCountAll ?? 0} />
        </div>
      </Section>

      <p className="mt-8 text-xs text-neutral-400">
        登入帳號數：{usersCount ?? 0}
      </p>
    </SuperAdminShell>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="mt-8">{children}</section>;
}

function SectionHeader({
  title,
  hint,
  linkText,
  linkHref,
}: {
  title: string;
  hint?: string;
  linkText?: string;
  linkHref?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-medium text-neutral-900">{title}</p>
        {hint && (
          <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
            {hint}
          </p>
        )}
      </div>
      {linkText && linkHref && (
        <Link
          href={linkHref}
          className="text-xs text-neutral-500 hover:text-neutral-900 transition shrink-0"
        >
          {linkText}
        </Link>
      )}
    </div>
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
      <p className="text-xs text-neutral-500 leading-tight">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {format ? format(value) : value.toLocaleString()}
      </p>
    </div>
  );
}
