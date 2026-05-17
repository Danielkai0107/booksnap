"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { updatePlanPrice } from "../../actions";

type Props = {
  initial: {
    monthlyPrice: number;
    updatedAt: string | null;
  };
};

export default function PlansEditorClient({ initial }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [monthlyPrice, setMonthlyPrice] = useState(String(initial.monthlyPrice));

  const dirty = String(initial.monthlyPrice) !== monthlyPrice;

  function reset() {
    setMonthlyPrice(String(initial.monthlyPrice));
  }

  function save() {
    const price = Number(monthlyPrice);
    if (!Number.isInteger(price) || price < 0) {
      toast.error("價格需為 ≥ 0 的整數");
      return;
    }
    startTransition(async () => {
      const res = await updatePlanPrice("pro", { monthlyPrice: price });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pro 方案月費已更新");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium bg-indigo-50 text-indigo-700 border-indigo-100">
            Pro
          </span>
          {initial.updatedAt && (
            <span className="text-[11px] text-neutral-400">
              最後更新 {new Date(initial.updatedAt).toLocaleString("zh-TW")}
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

      <div className="mt-5 max-w-xs">
        <label className="block">
          <span className="text-xs text-neutral-500">月費</span>
          <div
            className={`mt-1.5 flex items-center gap-1.5 rounded-lg border bg-white px-3 h-10 ${
              busy
                ? "border-neutral-100 bg-neutral-50"
                : "border-neutral-200 focus-within:border-neutral-900"
            }`}
          >
            <span className="text-xs text-neutral-500 shrink-0">NT$</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={monthlyPrice}
              onChange={(e) => setMonthlyPrice(e.target.value)}
              disabled={busy}
              className="w-full bg-transparent text-sm text-neutral-900 tabular-nums outline-none disabled:text-neutral-500"
            />
            <span className="text-xs text-neutral-500 shrink-0">／月</span>
          </div>
        </label>
      </div>
    </section>
  );
}
