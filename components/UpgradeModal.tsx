"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import BottomSheet from "@/components/BottomSheet";
import { useToast } from "@/components/ToastProvider";
import { useAdminOrgInfo } from "@/lib/admin-org-info";

/**
 * Cross-app upgrade prompt. Mounted once inside `AdminShell` so any button can
 * call `useUpgradeModal().openUpgradeModal()` without each call site needing
 * its own modal copy. Replaces the per-page "quota exhausted" dialogs that
 * used to live in `/checkin/scan`, `ManualCheckinSheet`, etc.
 */

type UpgradeModalContextValue = {
  openUpgradeModal: (reason?: string) => void;
};

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(
  null,
);

export function useUpgradeModal(): UpgradeModalContextValue {
  const ctx = useContext(UpgradeModalContext);
  if (!ctx) {
    // Outside the provider (e.g. public pages) we no-op — callers there
    // shouldn't be triggering the modal anyway.
    return { openUpgradeModal: () => undefined };
  }
  return ctx;
}

function formatDateTW(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);

  const value = useMemo<UpgradeModalContextValue>(
    () => ({
      openUpgradeModal: (r?: string) => {
        setReason(r);
        setOpen(true);
      },
    }),
    [],
  );

  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      <UpgradeModalSheet open={open} reason={reason} onClose={() => setOpen(false)} />
    </UpgradeModalContext.Provider>
  );
}

function UpgradeModalSheet({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason?: string;
  onClose: () => void;
}) {
  const info = useAdminOrgInfo();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  // Display copy varies by trial state. The reason key is just a debug hint;
  // we don't render it directly.
  const isExpired = info.trialState === "expired_trial";
  const daysLeft = info.trialDaysRemaining ?? 0;
  const heading = isExpired
    ? "試用期已結束"
    : daysLeft > 0
      ? `試用還剩 ${daysLeft} 天`
      : "升級解鎖完整功能";

  const subtitle = isExpired
    ? "升級後即可繼續新增書本與使用借閱連結"
    : info.trialEndsAt
      ? `試用至 ${formatDateTW(info.trialEndsAt)}，升級可不中斷使用`
      : "升級 990／月解鎖完整功能";

  async function handleUpgrade() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await res.json()) as {
        redirectUrl?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.message ?? data.error ?? "升級失敗，請稍後再試");
        setBusy(false);
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      toast.success("已啟用 Pro 方案");
      onClose();
      router.refresh();
    } catch (err) {
      console.error("[upgrade-modal] subscribe failed", err);
      toast.error("升級失敗，請稍後再試");
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      compact
      title={heading}
      subtitle={subtitle}
      footer={
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={busy}
            className={`w-full text-white text-sm font-medium py-3 rounded-lg transition ${
              busy
                ? "bg-neutral-400 cursor-not-allowed"
                : "bg-neutral-900 hover:bg-neutral-800"
            }`}
          >
            {busy ? "處理中…" : "升級 Pro · NT$ 990／月"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            稍後再說
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-neutral-700">
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 px-4 py-3">
          <p className="text-xs text-neutral-500">Pro 方案</p>
          <p className="mt-1 text-base font-semibold text-neutral-900">
            NT$ 990 ／ 月
          </p>
          <p className="mt-1 text-xs text-neutral-500">隨時可取消，無綁約</p>
        </div>
        <ul className="space-y-2 text-sm text-neutral-700">
          <FeatureRow text="無限新書入庫，相機與手動入庫不再受限" />
          <FeatureRow text="啟用借閱連結，讀者可掃碼借書／還書／查書" />
          <FeatureRow text="完整智能辨識，書封自動帶入書名與作者" />
          <FeatureRow text="館藏匯出 Excel、標籤列印、分類管理" />
        </ul>
      </div>
    </BottomSheet>
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
