"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import {
  formatModelDate,
  type AnthropicVisionModel,
} from "@/lib/anthropic-models";
import { setAiRecognizeModels } from "../../actions";

type Props = {
  initialPrimary: string;
  initialFallback: string;
  /** Anthropic 目前可用、支援 image input 的模型清單。 */
  models: AnthropicVisionModel[];
};

const FALLBACK_OFF_VALUE = "";

/**
 * 智能辨識模型編輯表單（下拉版）。
 *
 * - 主要模型必選
 * - 備用模型可選「不啟用備用」（空字串值）
 * - 若目前儲存的 id 不在 Anthropic 回傳清單中（罕見：模型剛被下架但設定還是舊值），
 *   會把該值補進選項並標示「（清單未列出）」，避免下拉「漏選」現有值
 * - 備用模型清單會排除目前選定的主要模型，避免兩邊指向同一個
 */
export default function AiModelsForm({
  initialPrimary,
  initialFallback,
  models,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [primary, setPrimary] = useState(initialPrimary);
  const [fallback, setFallback] = useState(initialFallback);

  // 目前儲存的值若不在 Anthropic 回傳清單，補成「未列出」選項顯示。
  const primaryOptions = useMemo(
    () => augmentWithCurrent(models, primary),
    [models, primary],
  );
  const fallbackOptions = useMemo(
    () =>
      augmentWithCurrent(models, fallback).filter((m) => m.id !== primary),
    [models, primary, fallback],
  );

  const dirty =
    primary.trim() !== initialPrimary.trim() ||
    fallback.trim() !== initialFallback.trim();

  function save() {
    if (!primary.trim()) {
      toast.error("請選擇主要模型");
      return;
    }
    if (fallback && fallback === primary) {
      toast.error("備用模型不能與主要模型相同");
      return;
    }
    startTransition(async () => {
      const res = await setAiRecognizeModels(primary, fallback);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        fallback ? "已更新主要 / 備用模型" : "已更新主要模型，備用模型已關閉",
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
      <ModelSelect
        label="主要模型"
        hint="必選。每次拍照辨識預設使用此模型。"
        value={primary}
        onChange={(v) => {
          setPrimary(v);
          // 主要變了之後若跟備用撞，自動清空備用避免存進去再被擋。
          if (v === fallback) setFallback(FALLBACK_OFF_VALUE);
        }}
        options={primaryOptions}
        busy={busy}
      />
      <ModelSelect
        label="備用模型"
        hint="選填。主要模型 API 失敗（fetch 例外或非 2xx）時自動改用此模型。「不啟用備用」可關閉此機制。"
        value={fallback}
        onChange={setFallback}
        options={fallbackOptions}
        busy={busy}
        allowOff
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
          disabled={busy || !dirty || !primary.trim()}
          className="bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-sm font-medium px-4 h-10 rounded-lg transition"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}

function ModelSelect({
  label,
  hint,
  value,
  onChange,
  options,
  busy,
  allowOff,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  options: AugmentedModel[];
  busy: boolean;
  allowOff?: boolean;
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
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          className="w-full bg-transparent text-sm text-neutral-900 outline-none disabled:text-neutral-500 font-mono"
        >
          {allowOff && (
            <option value={FALLBACK_OFF_VALUE}>不啟用備用</option>
          )}
          {options.map((m) => {
            const date = formatModelDate(m.createdAt);
            const tail = [m.displayName, date, m.notInList ? "清單未列出" : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <option key={m.id} value={m.id}>
                {m.id}
                {tail ? `  —  ${tail}` : ""}
              </option>
            );
          })}
        </select>
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-400 leading-relaxed">
        {hint}
      </p>
    </label>
  );
}

type AugmentedModel = AnthropicVisionModel & { notInList?: boolean };

/**
 * 把目前儲存的 model id 強制納入選項，避免「設定值已 deprecated → 下拉裡
 * 選不到 → save 時被驗證擋掉」這種找不到出口的情境。標示 notInList 讓 UI
 * 可以在 label 顯示提醒。
 */
function augmentWithCurrent(
  models: AnthropicVisionModel[],
  current: string,
): AugmentedModel[] {
  const trimmed = current.trim();
  if (!trimmed) return models;
  if (models.some((m) => m.id === trimmed)) return models;
  return [
    { id: trimmed, displayName: trimmed, createdAt: "", notInList: true },
    ...models,
  ];
}
