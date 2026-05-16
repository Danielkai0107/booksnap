"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Display name written into `books.admin_name` for every freshly checked-in book. */
  operator: string;
};

/**
 * Tiny client wrapper that seeds the checkin operator name into sessionStorage
 * and bounces to the camera scan page. Kept separate so the parent page can
 * stay a server component (auth gating + initial data via `requireUnitSession`).
 */
export default function CheckinEntryClient({ operator }: Props) {
  const router = useRouter();

  useEffect(() => {
    try {
      sessionStorage.removeItem("books");
      sessionStorage.setItem("adminName", operator);
    } catch {
      // sessionStorage can throw in private mode; the scan page will surface
      // the missing operator state.
    }
    router.replace("/checkin/scan");
  }, [operator, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <div
        className="w-9 h-9 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin"
        aria-label="正在開啟入庫掃描"
      />
    </main>
  );
}
