"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useToast } from "@/components/ToastProvider";
import { useAdminOrgInfo } from "@/lib/admin-org-info";

type Props = {
  publicUrl: string;
  publicSlug: string;
  orgName: string;
  publicBorrowEnabled: boolean;
  publicCatalogEnabled: boolean;
};

/**
 * UI for the unit's public sharing surface. Two stacked cards:
 *  1. QR poster + share / download buttons — what admins hand out.
 *  2. Two opt-out toggles that gate the anonymous `/o/{slug}` pages.
 *
 * Toggles save instantly with optimistic UI and revert on server-side
 * rejection so admins get immediate visual feedback. The QR uses the actual
 * host header so preview / production each generate the right poster.
 */
export default function PublicLinkClient({
  publicUrl,
  publicSlug,
  orgName,
  publicBorrowEnabled,
  publicCatalogEnabled,
}: Props) {
  const [borrowEnabled, setBorrowEnabled] = useState(publicBorrowEnabled);
  const [catalogEnabled, setCatalogEnabled] = useState(publicCatalogEnabled);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [savingFor, setSavingFor] = useState<"borrow" | "catalog" | null>(null);
  const toast = useToast();
  const router = useRouter();
  const { locked } = useAdminOrgInfo();
  // 鎖定狀態下所有 CTA 一律導去 /billing，讓使用者看到完整升級情境
  // （體驗狀態、金流主開關等），而不是被半路彈窗打斷。
  const goToBilling = () => router.push("/billing");

  useEffect(() => {
    QRCode.toDataURL(publicUrl, {
      margin: 2,
      width: 480,
      color: { dark: "#0a0a0a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => setQrUrl(url))
      .catch((err) => console.error("[public-link] qr error", err));
  }, [publicUrl]);

  /**
   * 「分享連結」按鈕：手機優先用 OS 原生分享面板（iOS Share Sheet / Android
   * Intent Chooser）；桌機或裝置不支援 navigator.share 時退回剪貼簿。
   * 使用者取消（AbortError）視為正常流程、不顯示錯誤。
   */
  async function shareLink() {
    if (locked) {
      goToBilling();
      return;
    }
    const shareData = {
      url: publicUrl,
      title: `${orgName || "booksnap"} · 借還書`,
      text: "掃描書上 QR 即可借書、還書",
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.warn(
          "[public-link] native share failed, fallback to copy",
          err,
        );
      }
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("已複製借還連結");
    } catch (err) {
      console.error("[public-link] copy failed", err);
      toast.error("分享失敗，請手動複製連結");
    }
  }

  /**
   * 「前往」按鈕：在新分頁開啟讀者實際看到的借閱入口，方便管理員確認外觀。
   * 與側欄 BottomSheet 的「前往」行為一致。鎖定時改導去 /billing。
   */
  function goToPublic() {
    if (locked) {
      goToBilling();
      return;
    }
    window.open(publicUrl, "_blank", "noopener,noreferrer");
  }

  async function patchToggle(
    body: { public_borrow_enabled?: boolean; public_catalog_enabled?: boolean },
    which: "borrow" | "catalog",
  ) {
    setSavingFor(which);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("已更新");
    } catch (err) {
      console.error("[public-link] toggle failed", err);
      toast.error(err instanceof Error ? err.message : "更新失敗");
      // Server rejected the change — revert the optimistic local toggle.
      if (which === "borrow") setBorrowEnabled((v) => !v);
      else setCatalogEnabled((v) => !v);
    } finally {
      setSavingFor(null);
    }
  }

  // 桌機改成左右雙欄：QR 卡在左，動作按鈕＋toggle 卡在右，避免大片留白。
  // 手機 / 鎖定時仍維持單欄堆疊。
  const actionButtons = !locked && (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={shareLink}
        className="press-feedback inline-flex items-center justify-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium h-10 px-5 rounded-full transition"
      >
        <span>分享</span>
      </button>
      <button
        type="button"
        onClick={goToPublic}
        className="press-feedback inline-flex items-center justify-center gap-1.5 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium h-10 px-5 rounded-full transition"
      >
        <span>前往</span>
      </button>
      <a
        href={qrUrl || undefined}
        download={qrUrl ? `booksnap-${publicSlug}.png` : undefined}
        aria-disabled={!qrUrl}
        onClick={(e) => {
          if (!qrUrl) e.preventDefault();
        }}
        className={`press-feedback inline-flex items-center justify-center gap-1.5 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium h-10 px-5 rounded-full transition ${
          qrUrl ? "" : "opacity-50 cursor-not-allowed"
        }`}
      >
        <span>下載</span>
      </a>
    </div>
  );

  const qrCard = !locked && (
    <div className="border border-neutral-200 rounded-2xl p-4 md:p-5 flex flex-col items-center">
      {qrUrl ? (
        <img
          src={qrUrl}
          alt="借還 QR"
          className="w-44 h-44 md:w-52 md:h-52 rounded-lg"
        />
      ) : (
        <div className="w-44 h-44 md:w-52 md:h-52 bg-neutral-50 rounded-lg" />
      )}
      <p className="mt-3 text-xs text-neutral-500">給讀者的借還連結</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 鎖定時整個 QR / 分享卡都不渲染——QR 也好、分享按鈕也好，沒升級
          前都沒實際用途，顯示反而讓使用者誤會。直接讓畫面從說明 banner +
          toggle 開始即可。 */}
      {!locked && (
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] md:items-start gap-6">
          {qrCard}
          <div className="space-y-5">
            {actionButtons}
            <section className="border border-neutral-200 rounded-2xl p-5 md:p-6 divide-y divide-neutral-100">
              <ToggleRow
                label="讓讀者可以掃碼借還"
                description="關閉後，讀者畫面會顯示暫停服務。"
                checked={borrowEnabled}
                disabled={savingFor === "borrow"}
                locked={locked}
                onLockedClick={goToBilling}
                onChange={(v) => {
                  setBorrowEnabled(v);
                  void patchToggle({ public_borrow_enabled: v }, "borrow");
                }}
              />
              <ToggleRow
                label="讓讀者可以查書"
                description="關閉後，只能透過書上 QR 直達借還。"
                checked={catalogEnabled}
                disabled={savingFor === "catalog"}
                locked={locked}
                onLockedClick={goToBilling}
                onChange={(v) => {
                  setCatalogEnabled(v);
                  void patchToggle({ public_catalog_enabled: v }, "catalog");
                }}
              />
            </section>
          </div>
        </div>
      )}

      {locked && (
        <>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 flex items-center gap-3">
            <p className="flex-1 text-sm text-neutral-700 leading-relaxed">
              借閱連結為付費功能，升級後即可啟用兩個開關並對外分享。
            </p>
            <button
              type="button"
              onClick={goToBilling}
              className="shrink-0 inline-flex items-center h-[26px] px-2.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition"
            >
              升級
            </button>
          </div>
          <section className="border border-neutral-200 rounded-2xl p-5 md:p-6 divide-y divide-neutral-100">
            <ToggleRow
              label="讓讀者可以掃碼借還"
              description="關閉後，讀者畫面會顯示暫停服務。"
              checked={borrowEnabled}
              disabled={savingFor === "borrow"}
              locked={locked}
              onLockedClick={goToBilling}
              onChange={(v) => {
                setBorrowEnabled(v);
                void patchToggle({ public_borrow_enabled: v }, "borrow");
              }}
            />
            <ToggleRow
              label="讓讀者可以查書"
              description="關閉後，只能透過書上 QR 直達借還。"
              checked={catalogEnabled}
              disabled={savingFor === "catalog"}
              locked={locked}
              onLockedClick={goToBilling}
              onChange={(v) => {
                setCatalogEnabled(v);
                void patchToggle({ public_catalog_enabled: v }, "catalog");
              }}
            />
          </section>
        </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  locked,
  onLockedClick,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  /** When true, the toggle behaves as a button that opens the upgrade modal. */
  locked?: boolean;
  onLockedClick?: () => void;
  onChange: (v: boolean) => void;
}) {
  // 鎖定時整列改用 button 攔截點擊；toggle 視覺保持灰色＋鎖頭避免使用者以為壞掉。
  if (locked) {
    return (
      <button
        type="button"
        onClick={onLockedClick}
        className="w-full flex items-start justify-between gap-4 text-left py-4 first:pt-0 last:pb-0"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900">{label}</p>
          <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
            {description}
          </p>
        </div>
        <span className="shrink-0 mt-1 inline-flex h-6 w-11 items-center justify-center rounded-full bg-neutral-200/70 text-neutral-500">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
      </button>
    );
  }
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer py-4 first:pt-0 last:pb-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900">{label}</p>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      <span
        className={`shrink-0 mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition ${
          checked ? "bg-neutral-900" : "bg-neutral-200"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
    </label>
  );
}
