"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  href?: string;
  onClick?: () => void;
  className?: string;
  hideOnDesktop?: boolean;
};

export default function CloseButton({
  href,
  onClick,
  className = "",
  hideOnDesktop = false,
}: Props) {
  const router = useRouter();

  const base =
    "fixed top-4 left-4 z-40 w-10 h-10 rounded-full bg-white/55 backdrop-blur-md border border-white/40 shadow-sm flex items-center justify-center text-neutral-800 hover:bg-white/80 transition";
  const cls = `${base} ${hideOnDesktop ? "md:hidden" : ""} ${className}`;

  const Icon = (
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

  if (href) {
    return (
      <Link href={href} className={cls} aria-label="關閉">
        {Icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick ?? (() => router.back())}
      className={cls}
      aria-label="關閉"
    >
      {Icon}
    </button>
  );
}
