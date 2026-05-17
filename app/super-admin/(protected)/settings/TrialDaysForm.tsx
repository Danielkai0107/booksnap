"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { setTrialDays } from "../../actions";

export default function TrialDaysForm({ initialDays }: { initialDays: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [days, setDays] = useState(String(initialDays));

  const dirty = String(initialDays) !== days;
  const n = Number(days);
  const valid = Number.isInteger(n) && n > 0 && n <= 365;

  function save() {
    if (!valid) {
      toast.error("天數需為 1–365 的整數");
      return;
    }
    startTransition(async () => {
      const res = await setTrialDays(n);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`預設試用天數已更新為 ${n} 天`);
      router.refresh();
    });
  }

  function reset() {
    setDays(String(initialDays));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block flex-1 min-w-[200px] max-w-xs">
        <span className="text-xs text-neutral-500">試用天數</span>
        <div
          className={`mt-1.5 flex items-center gap-2 rounded-lg border bg-white px-3 h-10 ${
            busy
              ? "border-neutral-100 bg-neutral-50"
              : "border-neutral-200 focus-within:border-neutral-900"
          }`}
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={busy}
            className="w-full bg-transparent text-sm text-neutral-900 tabular-nums outline-none disabled:text-neutral-500"
          />
          <span className="text-xs text-neutral-500 shrink-0">天</span>
        </div>
      </label>
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
          disabled={busy || !dirty || !valid}
          className="bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-sm font-medium px-4 h-10 rounded-lg transition"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}
