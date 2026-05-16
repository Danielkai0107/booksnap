"use client";

import { useState } from "react";
import { TW_CITIES } from "@/lib/cities";
import { useToast } from "@/components/ToastProvider";

type BasicInfo = {
  name: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
};

type Props = {
  basic: BasicInfo;
};

/**
 * Editable card for the four fields the unit filled in at registration. Lives
 * on `/settings/profile` (the unit's basic info page) — the public link and its
 * toggles live on a separate `/public-link` page so the two concerns
 * don't pile up on a single screen.
 *
 * The save button stays disabled until something actually changes so admins
 * don't accidentally double-submit identical data.
 */
export default function SettingsClient({ basic }: Props) {
  const [name, setName] = useState(basic.name);
  const [city, setCity] = useState(basic.city);
  const [contactEmail, setContactEmail] = useState(basic.contactEmail);
  const [contactPhone, setContactPhone] = useState(basic.contactPhone);
  // Baseline snapshot used to compute the "dirty" state for the save button.
  // Refreshed after every successful save so subsequent edits feel fresh.
  const [baseline, setBaseline] = useState(basic);
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
    <div className="space-y-6">
      <section className="border border-neutral-200 rounded-2xl p-5 md:p-7 space-y-4">
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
          hint="這是對外聯絡用 Email，非登入 Email。若需更改登入帳號請聯絡營運方。"
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
    </div>
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
