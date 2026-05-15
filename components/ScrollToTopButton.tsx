"use client";

import { useEffect, useState } from "react";

type Props = {
  /** 滑動超過幾 px 才顯示按鈕 */
  threshold?: number;
  className?: string;
  /** 手機版要不要把按鈕往上抬，避開固定底部操作列 */
  lifted?: boolean;
};

/**
 * 右下角懸浮按鈕，捲動超過 threshold 時淡入。
 * 點擊回到頁面最上方（使用 smooth scroll）。
 */
export default function ScrollToTopButton({
  threshold = 240,
  className = "",
  lifted = false,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="回到頂部"
      className={`fixed right-5 z-40 w-11 h-11 rounded-full bg-neutral-900 text-white shadow-lg flex items-center justify-center transition-all duration-200 ${
        lifted ? "bottom-24 md:bottom-5" : "bottom-5"
      } ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none"
      } ${className}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden
      >
        <path
          d="M7 12V2M2 7L7 2L12 7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
