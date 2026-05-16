"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { useToast } from "@/components/ToastProvider";
import {
  PLAN_META,
  PLAN_ORDER,
  PLAN_PRICE,
  PLAN_QUOTAS,
  type OrgPlan,
} from "@/lib/plans";

type PlanMeta = (typeof PLAN_META)[OrgPlan];
type PlanPrice = (typeof PLAN_PRICE)[OrgPlan];
type PlanQuota = (typeof PLAN_QUOTAS)[OrgPlan];

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

export default function BillingClient({
  plan,
  planMeta,
  planPrice,
  planQuotas,
  subscription,
  payments,
  initialBanner,
  highlightPlan,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<OrgPlan>(
    highlightPlan ?? (plan === "free" ? "pro" : plan),
  );

  useEffect(() => {
    if (initialBanner === "welcome") {
      toast.success("訂閱成功，方案已啟用");
    } else if (initialBanner === "ai_quota") {
      toast.error("智能辨識本月配額已用完，請升級方案");
    } else if (initialBanner === "book_quota") {
      toast.error("館藏冊數已達上限，請升級方案");
    }
  }, [initialBanner, toast]);

  // 'active + cancel_at_period_end=true' means: paid window still valid but
  // will lapse at period_end. We still show the user as a Pro/Plus subscriber.
  const isPaid =
    subscription !== null &&
    (subscription.status === "active" || subscription.status === "past_due");
  const willEndOn =
    subscription?.cancelAtPeriodEnd && isPaid
      ? subscription.currentPeriodEnd
      : null;

  const subscribeTo = (target: PaidPlan) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: target }),
        });
        const data = (await res.json()) as {
          redirectUrl?: string;
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          toast.error(data.message ?? data.error ?? "訂閱失敗，請稍後再試");
          return;
        }
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          router.refresh();
        }
      } catch (err) {
        console.error("[billing] subscribe failed", err);
        toast.error("訂閱失敗，請稍後再試");
      }
    });
  };

  const cancelSubscription = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/cancel", { method: "POST" });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "取消失敗，請稍後再試");
          return;
        }
        toast.success("已排程取消，期末後降回 Free 方案");
        setConfirmCancel(false);
        router.refresh();
      } catch (err) {
        console.error("[billing] cancel failed", err);
        toast.error("取消失敗，請稍後再試");
      }
    });
  };

  const resumeSubscription = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/resume", { method: "POST" });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "恢復失敗，請稍後再試");
          return;
        }
        toast.success("已恢復訂閱");
        router.refresh();
      } catch (err) {
        console.error("[billing] resume failed", err);
        toast.error("恢復失敗，請稍後再試");
      }
    });
  };

  const handlePlanCta = (target: OrgPlan) => {
    if (target === "free") {
      if (subscription && isPaid && !subscription.cancelAtPeriodEnd) {
        setConfirmCancel(true);
      }
      return;
    }
    subscribeTo(target);
  };

  return (
    <AdminShell topbarTitle="訂閱設定" backHref="/admin">
      <div className="space-y-8">
        <CurrentSubscriptionCard
          plan={plan}
          planMeta={planMeta}
          planPrice={planPrice}
          planQuotas={planQuotas}
          subscription={subscription}
          isPaid={isPaid}
          willEndOn={willEndOn}
          busy={busy}
          onCancelClick={() => setConfirmCancel(true)}
          onResumeClick={resumeSubscription}
        />

        <section>
          <h2 className="text-base font-semibold text-neutral-900">選擇方案</h2>
          <p className="mt-1.5 text-xs text-neutral-500">
            按下訂閱即啟用方案，配額與權限會即時套用。
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {PLAN_ORDER.map((p) => {
              const m = PLAN_META[p];
              const q = PLAN_QUOTAS[p];
              const pr = PLAN_PRICE[p];
              const isCurrent = p === plan;
              const isHighlighted = selectedPlan === p;
              return (
                <li key={p}>
                  {/*
                   * 外層用 div + role="button"，避免 button > button 巢狀
                   * 造成的 hydration 錯誤。內層的 CTA 才是真正觸發訂閱／取消的按鈕。
                   */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={isHighlighted}
                    onClick={() => setSelectedPlan(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedPlan(p);
                      }
                    }}
                    className={`group relative w-full h-full text-left rounded-2xl border-2 px-4 py-4 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10 cursor-pointer ${
                      isHighlighted
                        ? "border-neutral-900 bg-neutral-50"
                        : "border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium ${m.pillClass}`}
                      >
                        {m.label}
                      </span>
                      {isCurrent && (
                        <span className="text-[11px] text-neutral-500">
                          目前方案
                        </span>
                      )}
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
                      subscription={subscription}
                      busy={busy}
                      onClick={() => handlePlanCta(p)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <PaymentHistorySection payments={payments} />
      </div>

      {confirmCancel && (
        <CancelDialog
          willEndOn={
            subscription?.currentPeriodEnd ?? new Date().toISOString()
          }
          busy={busy}
          onCancel={() => setConfirmCancel(false)}
          onConfirm={cancelSubscription}
        />
      )}
    </AdminShell>
  );
}

function PlanCtaButton({
  planKey,
  currentPlan,
  subscription,
  busy,
  onClick,
}: {
  planKey: OrgPlan;
  currentPlan: OrgPlan;
  subscription: SubscriptionView | null;
  busy: boolean;
  onClick: () => void;
}) {
  const isCurrent = planKey === currentPlan;
  // The "Free" card during a paid plan represents a downgrade (= cancel).
  let label = "";
  let disabled = busy;
  if (planKey === "free") {
    if (currentPlan === "free") {
      label = "目前方案";
      disabled = true;
    } else if (subscription?.cancelAtPeriodEnd) {
      label = "已排程降級";
      disabled = true;
    } else {
      label = "降級到 Free";
    }
  } else if (isCurrent) {
    label = "目前方案";
    disabled = true;
  } else {
    label = `訂閱 ${PLAN_META[planKey].label}`;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className={`mt-4 w-full px-3 py-2 rounded-lg text-sm font-medium transition ${
        disabled
          ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
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
  willEndOn,
  busy,
  onCancelClick,
  onResumeClick,
}: {
  plan: OrgPlan;
  planMeta: PlanMeta;
  planPrice: PlanPrice;
  planQuotas: PlanQuota;
  subscription: SubscriptionView | null;
  isPaid: boolean;
  willEndOn: string | null;
  busy: boolean;
  onCancelClick: () => void;
  onResumeClick: () => void;
}) {
  const headerLabel = isPaid ? "當前訂閱" : "當前方案";

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      {willEndOn && (
        <div className="rounded-t-2xl bg-amber-50 px-5 py-3 text-xs text-amber-800 border-b border-amber-100">
          已排程取消，方案將於 <strong>{formatDateTW(willEndOn)}</strong> 後失效。
          在此之前你的方案權益不會受影響。
        </div>
      )}
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-neutral-500">{headerLabel}</p>
            <div className="mt-1 flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                {planMeta.label}
              </h1>
              <span
                className={`inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium ${planMeta.pillClass}`}
              >
                {plan === "free" ? "免費" : "付費中"}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-neutral-700">{planPrice.label}</p>
            {isPaid && subscription && (
              <div className="mt-4 space-y-1 text-sm text-neutral-700">
                {!subscription.cancelAtPeriodEnd ? (
                  <p>
                    您的下個帳單日期是{" "}
                    <strong className="text-neutral-900">
                      {formatDateTW(subscription.currentPeriodEnd)}
                    </strong>
                    。
                  </p>
                ) : (
                  <p>
                    將於{" "}
                    <strong className="text-neutral-900">
                      {formatDateTW(subscription.currentPeriodEnd)}
                    </strong>{" "}
                    後降回 Free 方案。
                  </p>
                )}
                <p className="text-xs text-neutral-500">
                  自{" "}
                  {formatDateTW(subscription.startedAt)} 起訂閱 ·{" "}
                  {subscription.gateway === "instant"
                    ? "內部測試金流"
                    : subscription.gateway}
                </p>
              </div>
            )}
            {!isPaid && (
              <p className="mt-4 text-sm text-neutral-600">
                目前為免費方案：智能辨識 {planQuotas.ai.toLocaleString()} 次／月、館藏上限{" "}
                {planQuotas.books.toLocaleString()} 冊。升級後可大幅放寬。
              </p>
            )}
          </div>
          {isPaid && (
            <div className="shrink-0">
              {subscription?.cancelAtPeriodEnd ? (
                <button
                  type="button"
                  onClick={onResumeClick}
                  disabled={busy}
                  className="bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
                >
                  恢復訂閱
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCancelClick}
                  disabled={busy}
                  className="bg-white border border-neutral-300 hover:border-neutral-500 text-neutral-900 text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
                >
                  取消訂閱
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PaymentHistorySection({ payments }: { payments: PaymentView[] }) {
  const rows = useMemo(() => payments, [payments]);
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-semibold text-neutral-900">帳單記錄</h2>
      <p className="mt-1.5 text-xs text-neutral-500">
        過去 50 筆扣款紀錄，最近的在上方。
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">尚無帳單紀錄。</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
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
                  <td className="py-3 pr-3 text-neutral-800 tabular-nums">
                    {formatDateTW(p.createdAt)}
                  </td>
                  <td className="py-3 pr-3 text-neutral-900 tabular-nums font-medium">
                    {formatAmount(p.amount)}
                  </td>
                  <td className="py-3 pr-3">
                    <PaymentStatusPill status={p.status} />
                  </td>
                  <td className="py-3 text-xs text-neutral-500 tabular-nums">
                    {p.periodStart && p.periodEnd
                      ? `${formatDateTW(p.periodStart)} ~ ${formatDateTW(p.periodEnd)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PaymentStatusPill({
  status,
}: {
  status: PaymentView["status"];
}) {
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

function CancelDialog({
  willEndOn,
  busy,
  onCancel,
  onConfirm,
}: {
  willEndOn: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="關閉"
        onClick={onCancel}
        className="absolute inset-0 bg-neutral-900/40"
      />
      <div className="relative w-full max-w-md bg-white rounded-2xl border border-neutral-200 shadow-xl p-6">
        <h3 className="text-base font-semibold text-neutral-900">取消訂閱？</h3>
        <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
          您將於{" "}
          <strong className="text-neutral-900">
            {formatDateTW(willEndOn)}
          </strong>{" "}
          後降回 Free 方案。在此之前仍可繼續使用目前方案的所有權益。
        </p>
        <div className="mt-6 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-3 py-1.5 rounded-md transition disabled:opacity-50"
          >
            繼續訂閱
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium px-3 py-1.5 rounded-md transition"
          >
            {busy ? "處理中…" : "確認取消"}
          </button>
        </div>
      </div>
    </div>
  );
}
