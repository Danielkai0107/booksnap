"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { TW_CITIES } from "@/lib/cities";
import { useToast } from "@/components/ToastProvider";

type BasicInfo = {
  name: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
};

type Props = {
  publicUrl: string;
  publicSlug: string;
  publicBorrowEnabled: boolean;
  publicCatalogEnabled: boolean;
  basic: BasicInfo;
};

/**
 * Settings UI for the unit. Has two stacked sections:
 *  1. 單位基本資料 — name / city / contact email / phone (originally collected
 *     at registration and editable here).
 *  2. 公開借還連結 — QR poster, copy button, and the two opt-out toggles.
 *
 * Each section saves independently against `PATCH /api/admin/settings`.
 */
export default function SettingsClient({
  publicUrl,
  publicSlug,
  publicBorrowEnabled,
  publicCatalogEnabled,
  basic,
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
      .catch((err) => console.error("[settings] qr error", err));
  }, [publicUrl]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("已複製公開連結");
    } catch (err) {
      console.error("[settings] copy failed", err);
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
      console.error("[settings] toggle failed", err);
      toast.error(err instanceof Error ? err.message : "更新失敗");
      // Revert local state since server-side rejected the change.
      if (which === "borrow") setBorrowEnabled((v) => !v);
      else setCatalogEnabled((v) => !v);
    } finally {
      setSavingFor(null);
    }
  }

  return (
    <div className="space-y-6">
      <BasicInfoSection initial={basic} />

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

/**
 * Editable card for the four fields the unit filled in at registration. The
 * save button stays disabled until something actually changes so admins don't
 * accidentally double-submit identical data.
 */
function BasicInfoSection({ initial }: { initial: BasicInfo }) {
  const [name, setName] = useState(initial.name);
  const [city, setCity] = useState(initial.city);
  const [contactEmail, setContactEmail] = useState(initial.contactEmail);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone);
  // Baseline snapshot used to compute the "dirty" state for the save button.
  // Refreshed after every successful save so subsequent edits feel fresh.
  const [baseline, setBaseline] = useState(initial);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const dirty =
    name.trim() !== baseline.name ||
    city !== baseline.city ||
    contactEmail.trim().toLowerCase() !== baseline.contactEmail ||
    contactPhone.trim() !== baseline.contactPhone;

  async function handleSave() {
    if (!dirty || saving) return;
    const trimmedName = name.trim();
    const trimmedEmail = contactEmail.trim().toLowerCase();
    const trimmedPhone = contactPhone.trim();

    if (!trimmedName) return toast.error("請輸入單位名稱");
    if (!city) return toast.error("請選擇縣市");
    if (!trimmedEmail) return toast.error("請輸入聯絡 Email");
    if (!trimmedPhone) return toast.error("請輸入聯絡電話");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          city,
          contact_email: trimmedEmail,
          contact_phone: trimmedPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Sync local fields to the canonical server values (e.g. trimmed/lowered)
      // and reset the dirty baseline.
      const next: BasicInfo = {
        name: trimmedName,
        city,
        contactEmail: trimmedEmail,
        contactPhone: trimmedPhone,
      };
      setName(next.name);
      setContactEmail(next.contactEmail);
      setContactPhone(next.contactPhone);
      setBaseline(next);
      toast.success("已更新單位資料");
    } catch (err) {
      console.error("[settings] basic info save failed", err);
      toast.error(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-neutral-200 rounded-2xl p-5 md:p-7 space-y-4">
      <header>
        <h2 className="text-base font-semibold text-neutral-900">
          單位基本資料
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          這些是註冊時填寫的資料，可隨時更新。
        </p>
      </header>

      <Field label="單位名稱">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </Field>

      <Field label="縣市">
        <div className="relative">
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={`w-full appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-neutral-200 bg-white focus:outline-none focus:border-neutral-900 transition ${
              city === "" ? "text-neutral-400" : "text-neutral-900"
            }`}
          >
            <option value="" disabled>
              請選擇縣市
            </option>
            {TW_CITIES.map((c) => (
              <option key={c} value={c} className="text-neutral-900">
                {c}
              </option>
            ))}
          </select>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
            aria-hidden
          >
            <path d="M3 5l3 3 3-3" />
          </svg>
        </div>
      </Field>

      <Field
        label="聯絡 Email"
        hint="這是公開聯絡用 Email，非登入 Email。若需更改登入帳號請聯絡營運方。"
      >
        <input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          autoComplete="email"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </Field>

      <Field label="聯絡電話">
        <input
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          autoComplete="tel"
          placeholder="例：02-1234-5678"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </Field>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="inline-flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition disabled:bg-neutral-300 disabled:cursor-not-allowed"
        >
          {saving ? "儲存中…" : "儲存變更"}
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1.5">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1.5 text-[11px] text-neutral-400 leading-relaxed">
          {hint}
        </p>
      )}
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
