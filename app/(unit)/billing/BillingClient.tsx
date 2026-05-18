"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { useToast } from "@/components/ToastProvider";
import { EXPERIENCE_TAG_CLASS, type PlanPriceConfig } from "@/lib/plans";
import type { TrialState } from "@/lib/billing/lock";

export type SubscriptionView = {
  id: string;
  status: "pending" | "active" | "past_due" | "cancelled" | "expired";
  plan: "pro";
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  scheduledPlan: "trial" | "pro" | null;
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
  proPrice: PlanPriceConfig;
  trialState: TrialState;
  trialDaysRemaining: number | null;
  trialEndsAt: string | null;
  subscription: SubscriptionView | null;
  payments: PaymentView[];
  initialBanner: "welcome" | string | null;
  /** Master monetization switch. When false, the 升級 Pro CTA is disabled
   * (button label changes to「升級通道暫未開放」). 頁面不再多加說明 banner —
   * 按鈕本身的 disabled 樣式就已經足夠清楚。 */
  billingEnabled: boolean;
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
  proPrice,
  trialState,
  trialDaysRemaining,
  trialEndsAt,
  subscription,
  payments,
  initialBanner,
  billingEnabled,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (initialBanner === "welcome") {
      toast.success("已啟用 Pro 方案");
    }
  }, [initialBanner, toast]);

  const handleSubscribe = () => {
    // 金流主開關關閉時頁面頂端已有 BillingPausedBanner 解釋現況，
    // 按鈕本身也是 disabled 樣式；這裡多一道防線避免誤打到 API。
    if (!billingEnabled) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/subscribe", { method: "POST" });
        const data = (await res.json()) as {
          redirectUrl?: string;
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          toast.error(data.message ?? data.error ?? "升級失敗，請稍後再試");
          return;
        }
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
        toast.success("已啟用 Pro 方案");
        router.refresh();
      } catch (err) {
        console.error("[billing] subscribe failed", err);
        toast.error("升級失敗，請稍後再試");
      }
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/cancel", { method: "POST" });
        const data = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) {
          toast.error(data.message ?? data.error ?? "取消失敗，請稍後再試");
          return;
        }
        toast.success(
          subscription?.currentPeriodEnd
            ? `已排程於 ${formatDateTW(subscription.currentPeriodEnd)} 取消`
            : "已排程取消",
        );
        router.refresh();
      } catch (err) {
        console.error("[billing] cancel failed", err);
        toast.error("取消失敗，請稍後再試");
      }
    });
  };

  const handleResume = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/resume", { method: "POST" });
        const data = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) {
          toast.error(data.message ?? data.error ?? "恢復失敗，請稍後再試");
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

  return (
    <AdminShell topbarTitle="訂閱管理" backHref="/settings">
      <div className="space-y-8">
        <StatusCard
          trialState={trialState}
          trialDaysRemaining={trialDaysRemaining}
          trialEndsAt={trialEndsAt}
          subscription={subscription}
          proPrice={proPrice}
          busy={busy}
          billingEnabled={billingEnabled}
          onSubscribe={handleSubscribe}
          onCancel={handleCancel}
          onResume={handleResume}
        />

        <PlanCard proPrice={proPrice} />

        <PaymentHistorySection payments={payments} />
      </div>
    </AdminShell>
  );
}


function StatusCard({
  trialState,
  trialDaysRemaining,
  trialEndsAt,
  subscription,
  proPrice,
  busy,
  billingEnabled,
  onSubscribe,
  onCancel,
  onResume,
}: {
  trialState: TrialState;
  trialDaysRemaining: number | null;
  trialEndsAt: string | null;
  subscription: SubscriptionView | null;
  proPrice: PlanPriceConfig;
  busy: boolean;
  billingEnabled: boolean;
  onSubscribe: () => void;
  onCancel: () => void;
  onResume: () => void;
}) {
  // 金流關閉時的 CTA 文案/樣式統一處理，方便 active_trial / expired_trial 共用。
  // 主開關關閉時頁面頂端已有 BillingPausedBanner 解釋現況，按鈕本身只需要
  // 顯示為「暫不可用」即可。
  const subscribeLabel = billingEnabled
    ? `立即升級 · ${proPrice.label}`
    : "升級通道暫未開放";
  const subscribeBusyLabel = busy ? "處理中…" : subscribeLabel;

  if (trialState === "active_trial") {
    const days = trialDaysRemaining ?? 0;
    return (
      <section className="rounded-2xl">
        <p className="text-xs text-neutral-500">目前狀態</p>
        <div className="mt-3 flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            體驗還剩 {days} 天
          </h1>
          <span
            className={`inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium ${EXPERIENCE_TAG_CLASS}`}
          >
            體驗中
          </span>
        </div>
        {trialEndsAt && (
          <p className="mt-3 text-sm text-neutral-700">
            體驗至{" "}
            <strong className="text-neutral-900">
              {formatDateTW(trialEndsAt)}
            </strong>
            。期間可預覽全功能，新書入庫與借閱連結需升級後才能使用。
          </p>
        )}
        <button
          type="button"
          onClick={onSubscribe}
          disabled={busy || !billingEnabled}
          className={`mt-5 w-full md:w-auto px-5 py-2.5 rounded-lg text-sm font-medium transition ${
            busy
              ? "bg-neutral-300 text-white cursor-not-allowed"
              : billingEnabled
                ? "bg-neutral-900 hover:bg-neutral-800 text-white"
                : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
          }`}
        >
          {subscribeBusyLabel}
        </button>
      </section>
    );
  }

  if (trialState === "expired_trial") {
    return (
      <section className="rounded-2xl">
        <p className="text-xs text-neutral-500">目前狀態</p>
        <div className="mt-3 flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            體驗已結束
          </h1>
          <span
            className={`inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium ${EXPERIENCE_TAG_CLASS}`}
          >
            體驗結束
          </span>
        </div>
        <p className="mt-3 text-sm text-neutral-700">
          您的體驗期已結束，新書入庫與借閱連結已暫停。升級後即可繼續使用，原有資料不會遺失。
        </p>
        <button
          type="button"
          onClick={onSubscribe}
          disabled={busy || !billingEnabled}
          className={`mt-5 w-full md:w-auto px-5 py-2.5 rounded-lg text-sm font-medium transition ${
            busy
              ? "bg-neutral-300 text-white cursor-not-allowed"
              : billingEnabled
                ? "bg-neutral-900 hover:bg-neutral-800 text-white"
                : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
          }`}
        >
          {subscribeBusyLabel}
        </button>
      </section>
    );
  }

  if (trialState === "cancelled_in_period" && subscription) {
    return (
      <section className="rounded-2xl">
        <p className="text-xs text-neutral-500">目前狀態</p>
        <div className="mt-3 flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            付費中（已排程取消）
          </h1>
          <span className="inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium bg-amber-50 text-amber-700 border-amber-100">
            到期取消
          </span>
        </div>
        <p className="mt-3 text-sm text-neutral-700">
          將於{" "}
          <strong className="text-neutral-900">
            {formatDateTW(subscription.currentPeriodEnd)}
          </strong>{" "}
          結束訂閱。在此之前所有功能正常使用，到期後新書入庫與借閱連結會暫停。
        </p>
        <button
          type="button"
          onClick={onResume}
          disabled={busy}
          className={`mt-5 w-full md:w-auto px-5 py-2.5 rounded-lg text-sm font-medium transition ${
            busy
              ? "bg-neutral-300 cursor-not-allowed text-neutral-500"
              : "bg-white border border-neutral-300 hover:border-neutral-500 text-neutral-900"
          }`}
        >
          {busy ? "處理中…" : "恢復訂閱"}
        </button>
      </section>
    );
  }

  // trialState === 'paid'
  if (subscription) {
    return (
      <section className="rounded-2xl">
        <p className="text-xs text-neutral-500">當前訂閱</p>
        <div className="mt-3 flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Pro
          </h1>
          <span className="inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium bg-indigo-50 text-indigo-700 border-indigo-100">
            付費中
          </span>
        </div>
        <p className="mt-3 text-sm text-neutral-700">{proPrice.label}</p>
        <div className="mt-4 space-y-1 text-sm text-neutral-700">
          <p>
            下個帳單日期：{" "}
            <strong className="text-neutral-900">
              {formatDateTW(subscription.currentPeriodEnd)}
            </strong>
          </p>
          <p className="text-xs text-neutral-500 mt-2">
            自 {formatDateTW(subscription.startedAt)} 起訂閱 ·{" "}
            {subscription.gateway === "instant"
              ? "內部測試金流"
              : subscription.gateway}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={`mt-5 w-full md:w-auto px-5 py-2.5 rounded-lg text-sm font-medium transition ${
            busy
              ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
              : "bg-white border border-neutral-300 hover:border-neutral-500 text-neutral-900"
          }`}
        >
          {busy ? "處理中…" : "到期取消"}
        </button>
      </section>
    );
  }

  return null;
}

function PlanCard({ proPrice }: { proPrice: PlanPriceConfig }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white px-5 py-5">
      <h2 className="text-base font-semibold text-neutral-900">Pro 方案</h2>
      <p className="mt-1 text-xs text-neutral-500">
        booksnap 採單一方案，所有功能皆可使用，隨時可取消。
      </p>
      <p className="mt-4 text-2xl font-semibold text-neutral-900">
        {proPrice.label}
      </p>
      <ul className="mt-4 space-y-2 text-sm text-neutral-700">
        <FeatureRow text="無限新書入庫，相機與手動入庫不再受限" />
        <FeatureRow text="啟用借閱連結，讀者可掃碼借書／還書／查書" />
        <FeatureRow text="每月 500 次智能辨識（每月自動更新）" />
        <FeatureRow text="館藏匯出 Excel、標籤列印、分類管理" />
      </ul>
    </section>
  );
}

function FeatureRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0 text-emerald-600"
        aria-hidden
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span className="text-neutral-700">{text}</span>
    </li>
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
      <span className="inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium bg-emerald-50 text-emerald-700 border-emerald-100">
        已付
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium bg-red-50 text-red-700 border-red-100">
        失敗
      </span>
    );
  }
  return (
    <span className="inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium bg-neutral-100 text-neutral-600 border-neutral-200">
      已退款
    </span>
  );
}
