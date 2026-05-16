"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useToast } from "@/components/ToastProvider";

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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl p-5 md:p-7 text-center">
        <div className="mb-5 flex justify-center">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrUrl}
              alt="借還 QR"
              className="w-48 h-48 md:w-56 md:h-56 border border-neutral-200 rounded-lg"
            />
          ) : (
            <div className="w-48 h-48 md:w-56 md:h-56 bg-neutral-50 rounded-lg" />
          )}
        </div>
        <p className="text-sm font-light text-neutral-500">給讀者的借還連結</p>

        <div className="mt-6 flex gap-3 md:justify-center">
          <button
            type="button"
            onClick={shareLink}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
          >
            <ShareIcon />
            <span>分享連結</span>
          </button>
          <a
            href={qrUrl || undefined}
            download={qrUrl ? `booksnap-${publicSlug}.png` : undefined}
            aria-disabled={!qrUrl}
            onClick={(e) => {
              if (!qrUrl) e.preventDefault();
            }}
            className={`flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-4 py-2.5 rounded-lg transition ${
              qrUrl ? "" : "opacity-50 cursor-not-allowed"
            }`}
          >
            <DownloadIcon />
            <span>下載 QR 圖</span>
          </a>
        </div>
      </section>

      <section className="border border-neutral-200 rounded-2xl p-5 md:p-7 space-y-4">
        <ToggleRow
          label="讓讀者可以掃碼借還"
          description="開啟後，讀者掃 QR 或開連結即可借還。關閉後，讀者畫面會顯示暫停服務。"
          checked={borrowEnabled}
          disabled={savingFor === "borrow"}
          onChange={(v) => {
            setBorrowEnabled(v);
            void patchToggle({ public_borrow_enabled: v }, "borrow");
          }}
        />
        <ToggleRow
          label="讓讀者可以查書"
          description="關閉後，讀者無法瀏覽館藏列表，只能透過書上 QR 直達借還。"
          checked={catalogEnabled}
          disabled={savingFor === "catalog"}
          onChange={(v) => {
            setCatalogEnabled(v);
            void patchToggle({ public_catalog_enabled: v }, "catalog");
          }}
        />
      </section>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900">{label}</p>
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
