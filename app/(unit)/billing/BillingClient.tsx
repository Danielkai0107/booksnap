"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { useToast } from "@/components/ToastProvider";
import {
  PLAN_META,
  PLAN_ORDER,
  type OrgPlan,
  type PlanPriceConfig,
  type PlanQuotaConfig,
} from "@/lib/plans";

type PlanMeta = (typeof PLAN_META)[OrgPlan];
type PlanPrice = PlanPriceConfig;
type PlanQuota = PlanQuotaConfig;

type PaidPlan = Exclude<OrgPlan, "free">;

export type SubscriptionView = {
  id: string;
  status: "pending" | "active" | "past_due" | "cancelled" | "expired";
  plan: PaidPlan;
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  scheduledPlan: OrgPlan | null;
  gateway: string;
};

export type PaymentView = {
  id: string;
  amount: number;
  status: "succeeded" | "failed" | "refunded";
  gateway: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
};

type Props = {
  orgName: string;
  plan: OrgPlan;
  planMeta: PlanMeta;
  planPrice: PlanPrice;
  planQuotas: PlanQuota;
  /** Quotas / prices for every tier, sourced from `plan_configs`. */
  allQuotas: Record<OrgPlan, PlanQuota>;
  allPrices: Record<OrgPlan, PlanPrice>;
  subscription: SubscriptionView | null;
  payments: PaymentView[];
  initialBanner: "welcome" | "ai_quota" | "book_quota" | null;
  highlightPlan: PaidPlan | null;
};

function formatDateTW(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatAmount(n: number): string {
  return `NT$ ${n.toLocaleString()}`;
}

const PLAN_RANK: Record<OrgPlan, number> = { free: 0, plus: 1, pro: 2 };

export default function BillingClient({
  plan,
  planMeta,
  planPrice,
  planQuotas,
  allQuotas,
  allPrices,
  subscription,
  payments,
  initialBanner,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (initialBanner === "welcome") {
      toast.success("訂閱成功，方案已啟用");
    } else if (initialBanner === "ai_quota") {
      toast.error("智能辨識本月配額已用完，請升級方案");
    } else if (initialBanner === "book_quota") {
      toast.error("館藏冊數已達上限，請升級方案");
    }
  }, [initialBanner, toast]);

  // `active + cancel_at_period_end` (i.e. scheduled_plan='free') still counts
  // as paid until period_end. So does `past_due` inside its grace window.
  const isPaid =
    subscription !== null &&
    (subscription.status === "active" || subscription.status === "past_due");
  const scheduledPlan = subscription?.scheduledPlan ?? null;
  const periodEnd = subscription?.currentPeriodEnd ?? null;

  /**
   * Targets a plan card. The current-plan card no longer renders a button,
   * so `target === plan` never reaches this handler.
   *  - Free org → immediate activation via /subscribe.
   *  - Paid org + target = scheduled plan → /resume (cancel pending change).
   *  - Paid org + target = 'free' → /cancel (schedules downgrade).
   *  - Paid org + target = other paid plan → /subscribe (schedules switch).
   */
  const goToPlan = (target: OrgPlan) => {
    startTransition(async () => {
      try {
        let res: Response;
        let actionKind:
          | "activate"
          | "cancel-change"
          | "schedule-free"
          | "schedule-paid";
        if (!isPaid) {
          if (target === "free") return;
          actionKind = "activate";
          res = await fetch("/api/billing/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: target }),
          });
        } else if (target === scheduledPlan) {
          actionKind = "cancel-change";
          res = await fetch("/api/billing/resume", { method: "POST" });
        } else if (target === "free") {
          actionKind = "schedule-free";
          res = await fetch("/api/billing/cancel", { method: "POST" });
        } else {
          actionKind = "schedule-paid";
          res = await fetch("/api/billing/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: target }),
          });
        }

        const data = (await res.json()) as {
          redirectUrl?: string;
          error?: string;
          message?: string;
          scheduledPlan?: OrgPlan | null;
        };
        if (!res.ok) {
          toast.error(data.message ?? data.error ?? "操作失敗，請稍後再試");
          return;
        }
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
        if (actionKind === "activate") {
          toast.success("訂閱成功");
        } else if (actionKind === "cancel-change") {
          toast.success("已取消變更");
        } else if (actionKind === "schedule-free") {
          toast.success(
            periodEnd
              ? `將於 ${formatDateTW(periodEnd)} 後降回 Free 方案`
              : "已排程降級",
          );
        } else {
          toast.success(
            periodEnd
              ? `將於 ${formatDateTW(periodEnd)} 切換為 ${PLAN_META[target].label}`
              : "已排程切換方案",
          );
        }
        router.refresh();
      } catch (err) {
        console.error("[billing] plan change failed", err);
        toast.error("操作失敗，請稍後再試");
      }
    });
  };

  return (
    <AdminShell topbarTitle="訂閱管理" backHref="/settings">
      <div className="space-y-8">
        <CurrentSubscriptionCard
          plan={plan}
          planMeta={planMeta}
          planPrice={planPrice}
          planQuotas={planQuotas}
          subscription={subscription}
          isPaid={isPaid}
        />

        <section>
          <h2 className="text-base font-semibold text-neutral-900">選擇方案</h2>
          <p className="mt-3 text-xs text-neutral-500">
            {isPaid
              ? "切換方案會在當期結束時生效，可隨時重新選擇。"
              : "按下升級即啟用方案，配額與權限會即時套用。"}
          </p>
          <ul className="mt-6 mb-4 grid gap-3 sm:grid-cols-3">
            {PLAN_ORDER.map((p) => {
              const m = PLAN_META[p];
              const q = allQuotas[p];
              const pr = allPrices[p];
              const isCurrent = p === plan;
              const isScheduledTarget = scheduledPlan === p;
              return (
                <li key={p}>
                  <div
                    className={`relative w-full h-full text-left rounded-2xl border px-4 py-4 transition ${
                      isCurrent
                        ? "border-neutral-200 bg-neutral-50/60"
                        : "border-neutral-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap min-h-[22px]">
                      <span
                        className={`inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium ${m.pillClass}`}
                      >
                        {m.label}
                      </span>
                      {isCurrent ? (
                        <span className="text-[11px] text-neutral-500">
                          目前方案
                        </span>
                      ) : isScheduledTarget ? (
                        <span className="text-[11px] text-emerald-700">
                          已排程
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xl font-semibold text-neutral-900">
                      {pr.label}
                    </p>
                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between text-neutral-700">
                        <dt>智能辨識</dt>
                        <dd className="tabular-nums">
                          {q.ai.toLocaleString()} 次／月
                        </dd>
                      </div>
                      <div className="flex justify-between text-neutral-700">
                        <dt>館藏冊數</dt>
                        <dd className="tabular-nums">
                          {q.books.toLocaleString()} 冊
                        </dd>
                      </div>
                    </dl>
                    <PlanCtaButton
                      planKey={p}
                      currentPlan={plan}
                      scheduledPlan={scheduledPlan}
                      isPaid={isPaid}
                      busy={busy}
                      onClick={() => goToPlan(p)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <PaymentHistorySection payments={payments} />
      </div>
    </AdminShell>
  );
}

/**
 * Renders the action button for a single plan card. The current-plan card
 * has no button (it is just an info display). Otherwise:
 *
 * Free org:
 *  - paid card              → "升級"        (immediate via /subscribe)
 *
 * Paid org, target is the scheduled plan:
 *  - scheduledPlan card     → "取消變更"     (→ /resume, clears schedule)
 *
 * Paid org, any other card:
 *  - rank > current         → "升級"        (schedule via /subscribe)
 *  - rank < current         → "降級"        ('free' → /cancel; paid → /subscribe)
 */
function PlanCtaButton({
  planKey,
  currentPlan,
  scheduledPlan,
  isPaid,
  busy,
  onClick,
}: {
  planKey: OrgPlan;
  currentPlan: OrgPlan;
  scheduledPlan: OrgPlan | null;
  isPaid: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const isCurrent = planKey === currentPlan;
  if (isCurrent) {
    return (
      <p className="mt-4 w-full px-3 py-2 text-center text-sm font-medium text-neutral-300">
        目前方案
      </p>
    );
  }
  const isScheduled = scheduledPlan === planKey;

  let label: string;
  if (isScheduled) {
    label = "取消變更";
  } else if (!isPaid) {
    label = "升級";
  } else {
    const rankDelta = PLAN_RANK[planKey] - PLAN_RANK[currentPlan];
    label = rankDelta > 0 ? "升級" : "降級";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`mt-4 w-full px-3 py-2 rounded-lg text-sm font-medium transition ${
        busy
          ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
          : isScheduled
            ? "bg-white border border-neutral-300 hover:border-neutral-500 text-neutral-900"
            : "bg-neutral-900 hover:bg-neutral-800 text-white"
      }`}
    >
      {label}
    </button>
  );
}

function CurrentSubscriptionCard({
  plan,
  planMeta,
  planPrice,
  planQuotas,
  subscription,
  isPaid,
}: {
  plan: OrgPlan;
  planMeta: PlanMeta;
  planPrice: PlanPrice;
  planQuotas: PlanQuota;
  subscription: SubscriptionView | null;
  isPaid: boolean;
}) {
  const headerLabel = isPaid ? "當前訂閱" : "當前方案";
  const scheduledPlan = subscription?.scheduledPlan ?? null;

  return (
    <section className="rounded-2xl bg-white">
      <div className="">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-neutral-500">{headerLabel}</p>
            <div className="mt-3 flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                {planMeta.label}
              </h1>
              <span
                className={`inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium ${planMeta.pillClass}`}
              >
                {plan === "free" ? "免費" : "付費中"}
              </span>
            </div>
            <p className="mt-3 text-sm text-neutral-700">{planPrice.label}</p>
            {isPaid && subscription && (
              <div className="mt-4 space-y-1 text-sm text-neutral-700">
                {scheduledPlan === null ? (
                  <p>
                    您的下個帳單日期是{" "}
                    <strong className="text-neutral-900">
                      {formatDateTW(subscription.currentPeriodEnd)}
                    </strong>
                    。
                  </p>
                ) : scheduledPlan === "free" ? (
                  <p>
                    將於{" "}
                    <strong className="text-neutral-900">
                      {formatDateTW(subscription.currentPeriodEnd)}
                    </strong>{" "}
                    後降回 Free 方案。
                  </p>
                ) : (
                  <p>
                    將於{" "}
                    <strong className="text-neutral-900">
                      {formatDateTW(subscription.currentPeriodEnd)}
                    </strong>{" "}
                    切換為{" "}
                    <strong className="text-neutral-900">
                      {PLAN_META[scheduledPlan].label}
                    </strong>{" "}
                    方案。
                  </p>
                )}
                <p className="text-xs text-neutral-500 mt-2">
                  自 {formatDateTW(subscription.startedAt)} 起訂閱 ·{" "}
                  {subscription.gateway === "instant"
                    ? "內部測試金流"
                    : subscription.gateway}
                </p>
              </div>
            )}
            {!isPaid && (
              <p className="mt-4 text-sm text-neutral-600">
                目前為免費方案：智能辨識 {planQuotas.ai.toLocaleString()}{" "}
                次／月、館藏上限 {planQuotas.books.toLocaleString()}{" "}
                冊。升級後可大幅放寬。
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PaymentHistorySection({ payments }: { payments: PaymentView[] }) {
  const rows = useMemo(() => payments, [payments]);
  return (
    <section className="rounded-2xl bg-white">
      <h2 className="text-base font-semibold text-neutral-900">帳單記錄</h2>
      <p className="mt-3 text-xs text-neutral-500">
        過去 50 筆扣款紀錄，最近的在上方。
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">尚無帳單紀錄。</p>
      ) : (
        <>
          {/* 手機：卡片堆疊，避免 table 在窄螢幕擠壓中文長日期。 */}
          <ul className="mt-6 space-y-3 md:hidden">
            {rows.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-neutral-100 bg-neutral-50/40 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-neutral-900 tabular-nums">
                    {formatAmount(p.amount)}
                  </span>
                  <PaymentStatusPill status={p.status} />
                </div>
                <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                  {formatDateTW(p.createdAt)}
                </p>
                {p.periodStart && p.periodEnd && (
                  <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                    週期 {formatDateTW(p.periodStart)} ~{" "}
                    {formatDateTW(p.periodEnd)}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {/* 桌機：傳統表格。 */}
          <div className="mt-6 hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 border-b border-neutral-100">
                  <th className="text-left font-medium pb-2 pr-3">日期</th>
                  <th className="text-left font-medium pb-2 pr-3">金額</th>
                  <th className="text-left font-medium pb-2 pr-3">狀態</th>
                  <th className="text-left font-medium pb-2">方案週期</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-50">
                    <td className="py-3 pr-3 text-neutral-800 tabular-nums whitespace-nowrap">
                      {formatDateTW(p.createdAt)}
                    </td>
                    <td className="py-3 pr-3 text-neutral-900 tabular-nums font-medium whitespace-nowrap">
                      {formatAmount(p.amount)}
                    </td>
                    <td className="py-3 pr-3">
                      <PaymentStatusPill status={p.status} />
                    </td>
                    <td className="py-3 text-xs text-neutral-500 tabular-nums whitespace-nowrap">
                      {p.periodStart && p.periodEnd
                        ? `${formatDateTW(p.periodStart)} ~ ${formatDateTW(p.periodEnd)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function PaymentStatusPill({ status }: { status: PaymentView["status"] }) {
  if (status === "succeeded") {
    return (
      <span className="inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium bg-emerald-50 text-emerald-700 border-emerald-100">
        已付
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium bg-red-50 text-red-700 border-red-100">
        失敗
      </span>
    );
  }
  return (
    <span className="inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium bg-neutral-100 text-neutral-600 border-neutral-200">
      已退款
    </span>
  );
}
