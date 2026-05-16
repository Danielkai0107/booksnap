"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  /** Where the back button should land. Typically the org landing page. */
  homeHref: string;
};

/**
 * Topbar back arrow that disappears on the org landing page itself, where
 * there's nothing meaningful to go back to within the public flow.
 */
export default function BrandedBackButton({ homeHref }: Props) {
  const pathname = usePathname();
  if (pathname === homeHref) return null;

  return (
    <Link
      href={homeHref}
      aria-label="返回"
      className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 transition"
      style={{ marginTop: "calc(env(safe-area-inset-top) / 2)" }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    </Link>
  );
}
