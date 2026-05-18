"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { forceOrgState } from "@/app/super-admin/actions";

type Target = "fresh_trial" | "pro" | "expired_trial";

type Props = {
  orgId: string;
  orgName: string;
  /** compact：訂閱卡 footer 用（小按鈕橫排）；inline：列表卡用同款 */
  size?: "compact" | "inline";
};

const TARGET_LABEL: Record<Target, string> = {
  fresh_trial: "重置為剛核准",
  pro: "變成 Pro",
  expired_trial: "變成體驗已結束",
};

const TARGET_TOAST: Record<Target, string> = {
  fresh_trial: "已重置為剛核准的體驗",
  pro: "已切換為 Pro（本期 OCR 用量歸零）",
  expired_trial: "已切換為體驗已結束",
};

const TARGET_TONE: Record<Target, string> = {
  fresh_trial:
    "bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:text-neutral-900",
  pro: "bg-neutral-900 border-neutral-900 text-white hover:bg-neutral-800",
  expired_trial:
    "bg-white border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50",
};

const TARGET_INTRO: Record<Target, string> = {
  fresh_trial:
    "刪除目前訂閱列、方案改回 trial、體驗截止 = 今天 + 預設體驗天數。",
  pro: "重新走 InstantGateway 啟用 Pro。current_period_start = 現在，AI 本期用量歸零；不會真的扣款。",
  expired_trial:
    "刪除目前訂閱列、體驗截止 = 現在；下一次請求 isOrgLocked 即回 true。",
};

/**
 * 「快速狀態切換」三顆按鈕。直接呼叫 `forceOrgState`，附簡單的 confirm，
 * 用在 /super-admin/subscriptions 卡片底部讓 super-admin 一鍵測試切換。
 *
 * 與 OrgRowActions 的 ForceStateDialog 用同一份 server action，行為完全一致；
 * 只是這邊省掉 BottomSheet 流程、改用 native confirm，給「想快速操作」的情境。
 */
export default function ForceStateButtons({ orgId, orgName, size = "compact" }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busyTarget, setBusyTarget] = useState<Target | null>(null);

  function trigger(target: Target) {
    if (pending) return;
    const ok = window.confirm(
      `確定把「${orgName}」切換到「${TARGET_LABEL[target]}」？\n\n${TARGET_INTRO[target]}`,
    );
    if (!ok) return;
    setBusyTarget(target);
    startTransition(async () => {
      try {
        const res = await forceOrgState(orgId, target);
        if (res.ok) {
          toast.success(TARGET_TOAST[target]);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } finally {
        setBusyTarget(null);
      }
    });
  }

  const sizeClass =
    size === "compact"
      ? "text-xs px-3 h-8"
      : "text-sm px-3.5 h-9";

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(TARGET_LABEL) as Target[]).map((target) => {
        const isBusy = busyTarget === target;
        return (
          <button
            key={target}
            type="button"
            disabled={pending}
            onClick={() => trigger(target)}
            className={`inline-flex items-center justify-center rounded-lg border font-medium transition disabled:opacity-50 ${sizeClass} ${TARGET_TONE[target]}`}
          >
            {isBusy ? "切換中…" : TARGET_LABEL[target]}
          </button>
        );
      })}
    </div>
  );
}
