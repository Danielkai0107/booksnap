"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useToast } from "@/components/ToastProvider";

type Props = {
  publicUrl: string;
  publicSlug: string;
  publicBorrowEnabled: boolean;
  publicCatalogEnabled: boolean;
};

/**
 * UI for the unit's public sharing surface. Two stacked cards:
 *  1. QR poster + copy button + downloadable PNG — what admins hand out.
 *  2. Two opt-out toggles that gate the anonymous `/o/{slug}` pages.
 *
 * Toggles save instantly with optimistic UI and revert on server-side
 * rejection so admins get immediate visual feedback. The QR uses the actual
 * host header so preview / production each generate the right poster.
 */
export default function PublicLinkClient({
  publicUrl,
  publicSlug,
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

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("已複製公開連結");
    } catch (err) {
      console.error("[public-link] copy failed", err);
      toast.error("複製失敗，請手動選取");
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
      <section className="border border-neutral-200 rounded-2xl p-5 md:p-7 text-center">
        <h2 className="text-base font-semibold text-neutral-900">
          公開借還連結
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          slug ·{" "}
          <code className="font-mono text-neutral-700">{publicSlug}</code>
        </p>

        <div className="mt-5 flex justify-center">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrUrl}
              alt="公開連結 QR"
              className="w-48 h-48 md:w-56 md:h-56 border border-neutral-200 rounded-lg"
            />
          ) : (
            <div className="w-48 h-48 md:w-56 md:h-56 bg-neutral-50 rounded-lg" />
          )}
        </div>

        <div className="mt-5 text-left">
          <p className="text-xs text-neutral-500 mb-1 text-center">連結</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={publicUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 px-3 py-2.5 text-sm font-mono text-neutral-900 border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:border-neutral-400 text-center"
            />
            <button
              type="button"
              onClick={copyUrl}
              className="shrink-0 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
            >
              複製
            </button>
          </div>
          {qrUrl && (
            <div className="mt-3 text-center">
              <a
                href={qrUrl}
                download={`booksnap-${publicSlug}.png`}
                className="text-xs text-neutral-600 hover:text-neutral-900 underline-offset-2 hover:underline"
              >
                下載 QR 圖（適合張貼）
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="border border-neutral-200 rounded-2xl p-5 md:p-7 space-y-4">
        <ToggleRow
          label="開放公開借還"
          description="讓任何掃描 QR 或拿到連結的人使用。關閉後公開頁會顯示『暫停服務』。"
          checked={borrowEnabled}
          disabled={savingFor === "borrow"}
          onChange={(v) => {
            setBorrowEnabled(v);
            void patchToggle({ public_borrow_enabled: v }, "borrow");
          }}
        />
        <ToggleRow
          label="顯示公開書籍目錄"
          description="關閉後，不像讀者顯示館藏，只能透過 QR 直達借還。"
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
