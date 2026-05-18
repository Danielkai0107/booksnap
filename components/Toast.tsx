"use client";

import { useEffect, useState } from "react";
import { Z_INDEX } from "@/lib/ui/z-index";

export type ToastKind = "success" | "error" | "info";

type Props = {
  open: boolean;
  message: string;
  kind?: ToastKind;
  duration?: number;
  onClose: () => void;
};

/**
 * 全頁面浮動通知。顯示在畫面上方中央，自動於 duration 毫秒後消失。
 * 使用 sessionStorage 跨頁面傳遞時，可由父元件控制 open 與 onClose。
 */
export default function Toast({
  open,
  message,
  kind = "success",
  duration = 3000,
  onClose,
}: Props) {
  // 用內部 mounted 狀態做出場動畫
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => onClose(), duration);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [open, duration, onClose]);

  if (!mounted && !open) return null;

  const palette =
    kind === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : kind === "error"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-neutral-100 text-neutral-700 border-neutral-200";

  return (
    <div
      className={`fixed inset-x-0 flex justify-center px-4 pointer-events-none transition-all duration-200 ${
        open ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
      style={{
        zIndex: Z_INDEX.toast,
        top: "calc(env(safe-area-inset-top) + 68px)",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto inline-flex items-center gap-2 max-w-full px-4 py-2.5 rounded-full border shadow-lg shadow-black/5 text-sm font-medium ${palette}`}
      >
        {kind === "success" && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
        {kind === "error" && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        <span className="line-clamp-2 text-center leading-snug">{message}</span>
      </div>
    </div>
  );
}
