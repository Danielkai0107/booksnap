"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  href?: string;
  onClick?: () => void;
  className?: string;
  hideOnDesktop?: boolean;
  icon?: "x" | "arrow-left";
  ariaLabel?: string;
  /** 點擊後是否顯示全屏 loading（適合返回需要 server 渲染的頁面） */
  showLoadingOnClick?: boolean;
};

export default function CloseButton({
  href,
  onClick,
  className = "",
  hideOnDesktop = false,
  icon = "x",
  ariaLabel,
  showLoadingOnClick = true,
}: Props) {
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);

  const base =
    "fixed top-4 left-4 z-40 w-10 h-10 rounded-full bg-white/55 backdrop-blur-md border border-white/40 shadow-sm flex items-center justify-center text-neutral-800 hover:bg-white/80 transition";
  const cls = `${base} ${hideOnDesktop ? "md:hidden" : ""} ${className}`;

  const Icon =
    icon === "arrow-left" ? (
      <svg
        width="16"
        height="16"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M9 1L3 7L9 13"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M1 1L13 13M13 1L1 13"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  const label = ariaLabel ?? (icon === "arrow-left" ? "返回" : "關閉");

  const handleClick = () => {
    if (showLoadingOnClick) setNavigating(true);
    if (href) {
      router.push(href);
    } else if (onClick) {
      onClick();
    } else {
      router.back();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={cls}
        aria-label={label}
      >
        {Icon}
      </button>
      {navigating && (
        <div className="fixed inset-0 z-[60] bg-white flex items-center justify-center">
          <div className="w-9 h-9 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      )}
    </>
  );
}
