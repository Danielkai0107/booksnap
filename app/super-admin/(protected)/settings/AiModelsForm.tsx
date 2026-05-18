"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { setAiRecognizeModels } from "../../actions";

type Props = {
  initialPrimary: string;
  initialFallback: string;
};

/**
 * 智能辨識模型編輯表單。主要模型必填，備用模型選填（清空 = 關閉 fallback）。
 *
 * 驗證僅做最低限度（claude- 前綴 + 長度 + 不可同名）；實際模型是否有效
 * 交給 Anthropic API 回應檢查。儲存後 60s 內快取會自動失效。
 */
export default function AiModelsForm({
  initialPrimary,
  initialFallback,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [primary, setPrimary] = useState(initialPrimary);
  const [fallback, setFallback] = useState(initialFallback);

  const primaryTrim = primary.trim();
  const fallbackTrim = fallback.trim();
  const dirty =
    primaryTrim !== initialPrimary.trim() ||
    fallbackTrim !== initialFallback.trim();
  const primaryValid =
    primaryTrim.length > 0 &&
    primaryTrim.length <= 80 &&
    primaryTrim.toLowerCase().startsWith("claude-");
  const fallbackValid =
    fallbackTrim.length === 0 ||
    (fallbackTrim.length <= 80 &&
      fallbackTrim.toLowerCase().startsWith("claude-") &&
      fallbackTrim !== primaryTrim);
  const valid = primaryValid && fallbackValid;

  function save() {
    if (!valid) {
      if (!primaryValid) toast.error("主要模型需以 claude- 開頭，長度 ≤ 80");
      else if (fallbackTrim === primaryTrim)
        toast.error("備用模型不能與主要模型相同");
      else toast.error("備用模型需以 claude- 開頭，長度 ≤ 80（或留空關閉）");
      return;
    }
    startTransition(async () => {
      const res = await setAiRecognizeModels(primaryTrim, fallbackTrim);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        fallbackTrim
          ? "已更新主要 / 備用模型"
          : "已更新主要模型，備用模型已關閉",
      );
      router.refresh();
    });
  }

  function reset() {
    setPrimary(initialPrimary);
    setFallback(initialFallback);
  }

  return (
    <div className="space-y-4">
      <Field
        label="主要模型"
        hint="必填。每次拍照辨識預設使用此模型。"
        value={primary}
        onChange={setPrimary}
        busy={busy}
        placeholder="claude-opus-4-7"
      />
      <Field
        label="備用模型"
        hint="選填。主要模型 API 失敗（fetch 例外或非 2xx）時自動改用此模型。留空可關閉備用機制。"
        value={fallback}
        onChange={setFallback}
        busy={busy}
        placeholder="例：claude-sonnet-4-20250514（留空關閉）"
      />
      <div className="flex items-center gap-3 pt-1">
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

function Field({
  label,
  hint,
  value,
  onChange,
  busy,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  busy: boolean;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-500">{label}</span>
      <div
        className={`mt-1.5 flex items-center rounded-lg border bg-white px-3 h-10 ${
          busy
            ? "border-neutral-100 bg-neutral-50"
            : "border-neutral-200 focus-within:border-neutral-900"
        }`}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent text-sm text-neutral-900 font-mono outline-none disabled:text-neutral-500"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-400 leading-relaxed">
        {hint}
      </p>
    </label>
  );
}
