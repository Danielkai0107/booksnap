"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { setBillingEnabled } from "../../actions";

/**
 * Optimistic toggle for `app_settings.billing_enabled`. When OFF, the in-app
 * upgrade CTAs (UpgradeModal + /billing 升級 Pro 按鈕) swap to a "金流準備中"
 * notice instead of opening the gateway. Use this while the real payment
 * provider (ECPay / Stripe) is not yet wired up.
 */
export default function BillingEnabledForm({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);

  function toggle() {
    if (busy) return;
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await setBillingEnabled(next);
      if (!res.ok) {
        setEnabled(!next);
        toast.error(res.error);
        return;
      }
      toast.success(next ? "已開放金流升級通道" : "已關閉金流，CTA 改顯示準備中");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-100 bg-neutral-50/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900">
          升級金流通道：{enabled ? "已開放" : "暫時關閉"}
        </p>
        <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
          關閉時，所有「升級 Pro」按鈕都會改成「booksnap 金流準備中，敬請期待」彈窗，
          不會打到 <code className="text-[11px]">/api/billing/subscribe</code>。
          試用倒數、付費中、取消後等顯示不受影響。
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={busy}
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
          enabled ? "bg-neutral-900" : "bg-neutral-300"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            enabled ? "translate-x-6" : "translate-x-1"
          } translate-y-1`}
        />
      </button>
    </div>
  );
}
