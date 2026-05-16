"use client";

import { useToast } from "@/components/ToastProvider";

type Props = {
  url: string;
  title?: string;
  text?: string;
};

/**
 * 手機版 topbar 上的「分享」按鈕。點下會喚起 OS 原生分享面板
 * （iOS Share Sheet / Android Intent Chooser）讓使用者直接傳給
 * 任何聯絡人或 app。
 *
 * 桌機瀏覽器多半也支援 navigator.share，但這顆按鈕設計上只給手機
 * （`md:hidden`）— 桌機已有頁面內的「複製連結 / 下載 QR」UI，
 * 不需要再多一個入口造成行動視覺擁擠。
 *
 * Fallback：navigator.share 不存在或被使用者取消時（AbortError），
 * 退回到剪貼簿複製；剪貼簿也失敗才報錯。
 */
export default function ShareButton({ url, title, text }: Props) {
  const toast = useToast();

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url, title, text });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.warn("[ShareButton] native share failed, fallback to copy", err);
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("已複製公開連結");
    } catch (err) {
      console.error("[ShareButton] copy failed", err);
      toast.error("分享失敗，請手動複製連結");
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="分享公開連結"
      className="press-feedback md:hidden inline-flex items-center gap-1 text-sm font-medium text-neutral-800 hover:text-neutral-900 bg-white border border-neutral-200 hover:border-neutral-400 px-3 h-9 rounded-full"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      <span className="leading-none">分享</span>
    </button>
  );
}
