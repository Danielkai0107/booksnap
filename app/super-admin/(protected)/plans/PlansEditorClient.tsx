"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { updatePlanConfig } from "../../actions";
import type { OrgPlan } from "@/lib/plans";

type PlanRow = {
  plan: OrgPlan;
  label: string;
  pillClass: string;
  aiQuota: number;
  bookQuota: number;
  monthlyPrice: number;
  updatedAt: string | null;
};

export default function PlansEditorClient({
  initial,
}: {
  initial: PlanRow[];
}) {
  return (
    <div className="space-y-4">
      {initial.map((row) => (
        <PlanCard key={row.plan} row={row} />
      ))}
    </div>
  );
}

function PlanCard({ row }: { row: PlanRow }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [aiQuota, setAiQuota] = useState(String(row.aiQuota));
  const [bookQuota, setBookQuota] = useState(String(row.bookQuota));
  const [monthlyPrice, setMonthlyPrice] = useState(String(row.monthlyPrice));

  const isFree = row.plan === "free";

  const dirty =
    String(row.aiQuota) !== aiQuota ||
    String(row.bookQuota) !== bookQuota ||
    String(row.monthlyPrice) !== monthlyPrice;

  function reset() {
    setAiQuota(String(row.aiQuota));
    setBookQuota(String(row.bookQuota));
    setMonthlyPrice(String(row.monthlyPrice));
  }

  function save() {
    const ai = Number(aiQuota);
    const books = Number(bookQuota);
    const price = Number(monthlyPrice);
    if (!Number.isInteger(ai) || ai < 0) {
      toast.error("AI 配額需為 ≥ 0 的整數");
      return;
    }
    if (!Number.isInteger(books) || books < 0) {
      toast.error("館藏配額需為 ≥ 0 的整數");
      return;
    }
    if (!Number.isInteger(price) || price < 0) {
      toast.error("價格需為 ≥ 0 的整數");
      return;
    }
    startTransition(async () => {
      const res = await updatePlanConfig(row.plan, {
        aiQuota: ai,
        bookQuota: books,
        monthlyPrice: price,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${row.label} 方案已更新`);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium ${row.pillClass}`}
          >
            {row.label}
          </span>
          {row.updatedAt && (
            <span className="text-[11px] text-neutral-400">
              最後更新 {new Date(row.updatedAt).toLocaleString("zh-TW")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="text-xs text-neutral-500 hover:text-neutral-900 transition disabled:opacity-50"
            >
              還原
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            {busy ? "儲存中…" : "儲存"}
          </button>
        </div>
      </header>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Field
          label="AI 配額"
          suffix="次／月"
          value={aiQuota}
          onChange={setAiQuota}
          disabled={busy}
        />
        <Field
          label="館藏冊數上限"
          suffix="冊"
          value={bookQuota}
          onChange={setBookQuota}
          disabled={busy}
        />
        <Field
          label="月費"
          prefix="NT$"
          value={monthlyPrice}
          onChange={setMonthlyPrice}
          disabled={busy || isFree}
          hint={isFree ? "Free 固定 0" : undefined}
        />
      </div>
    </section>
  );
}

function Field({
  label,
  prefix,
  suffix,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-500">{label}</span>
      <div
        className={`mt-1.5 flex items-center gap-1.5 rounded-lg border bg-white px-3 h-10 ${
          disabled
            ? "border-neutral-100 bg-neutral-50"
            : "border-neutral-200 focus-within:border-neutral-900"
        }`}
      >
        {prefix && (
          <span className="text-xs text-neutral-500 shrink-0">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-transparent text-sm text-neutral-900 tabular-nums outline-none disabled:text-neutral-500"
        />
        {suffix && (
          <span className="text-xs text-neutral-500 shrink-0">{suffix}</span>
        )}
      </div>
      {hint && <p className="mt-1 text-[11px] text-neutral-400">{hint}</p>}
    </label>
  );
}
