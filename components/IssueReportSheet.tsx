"use client";

import { useEffect, useState, type ReactNode } from "react";
import BottomSheet from "@/components/BottomSheet";
import CategorySelect from "@/components/CategorySelect";
import { useToast } from "@/components/ToastProvider";
import {
  ISSUE_REPORT_CATEGORIES,
  ISSUE_REPORT_REASON_MAX,
  type IssueReportCategory,
} from "@/lib/issue-report";

type Props = {
  open: boolean;
  onClose: () => void;
};

const selectOptions = ISSUE_REPORT_CATEGORIES.map((c) => ({
  value: c.value,
  label: c.label,
}));

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition resize-y min-h-[120px]";

export default function IssueReportSheet({ open, onClose }: Props) {
  const toast = useToast();
  const [category, setCategory] = useState<IssueReportCategory | "">("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory("");
    setReason("");
    setSubmitting(false);
  }, [open]);

  async function handleSubmit() {
    if (!category) {
      toast.error("請選擇類別");
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast.error("請至少輸入 10 個字說明原因");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/issue-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          reason: trimmed,
          pageUrl:
            typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "暫時無法送出，請稍後再試");
      }
      toast.success("已送出，感謝您的回報");
      onClose();
    } catch (err) {
      console.error("[issue-report] submit failed", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "暫時無法送出，請稍後再試";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      fitContent
      title="問題回報"
      subtitle="我們會將內容寄給營運團隊處理"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 min-w-0 bg-white border border-neutral-200 hover:border-neutral-400 disabled:opacity-50 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 min-w-0 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white text-sm font-medium py-3 rounded-lg transition"
          >
            {submitting ? "送出中…" : "送出"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-1 pb-1">
        <Field label="類別">
          <CategorySelect
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as IssueReportCategory | "")
            }
            options={selectOptions}
            placeholder="請選擇"
            disabled={submitting}
            required
          />
        </Field>
        <Field label="原因說明">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={ISSUE_REPORT_REASON_MAX}
            disabled={submitting}
            placeholder="請描述遇到的狀況，方便我們重現或排查"
            className={inputClass}
            rows={5}
          />
          <p className="mt-1.5 text-[11px] text-neutral-400 text-right tabular-nums">
            {reason.length}/{ISSUE_REPORT_REASON_MAX}
          </p>
        </Field>
      </div>
    </BottomSheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-neutral-500 mb-1.5">
        {label}
      </span>
      {children}
    </div>
  );
}
