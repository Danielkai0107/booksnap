"use client";

import { ReactNode, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import SuperAdminSidebar, {
  SuperAdminMobileMenu,
} from "@/components/SuperAdminSidebar";
import ScrollToTopButton from "@/components/ScrollToTopButton";

const TITLE_BY_PATH: { prefix: string; title: string; exact?: boolean }[] = [
  { prefix: "/super-admin/settings", title: "設定" },
  { prefix: "/super-admin/issue-reports", title: "問題回報" },
  { prefix: "/super-admin/organizations/", title: "單位詳情" },
  { prefix: "/super-admin/organizations", title: "單位管理", exact: true },
  { prefix: "/super-admin/subscriptions", title: "訂閱" },
  { prefix: "/super-admin/tokens", title: "Token 用量" },
  { prefix: "/super-admin/plans", title: "方案設定" },
  { prefix: "/super-admin", title: "總覽", exact: true },
];

function titleForPath(pathname: string): string {
  for (const { prefix, title, exact } of TITLE_BY_PATH) {
    if (exact ? pathname === prefix : pathname.startsWith(prefix)) {
      return title;
    }
  }
  return "營運後台";
}

type Props = {
  children: ReactNode;
  topbarTitle?: ReactNode;
  topbarRight?: ReactNode;
  backHref?: string;
  onBack?: () => void;
  scrollLifted?: boolean;
  contentWidth?: "default" | "wide";
};

/** 營運後台 shell：與單位後台 AdminShell 同款側欄 + topbar 佈局 */
export default function SuperAdminShell({
  children,
  topbarTitle,
  topbarRight,
  backHref,
  onBack,
  scrollLifted = false,
  contentWidth = "default",
}: Props) {
  const pathname = usePathname();
  const contentMaxClass =
    contentWidth === "wide"
      ? "w-full max-w-6xl"
      : "w-full max-w-2xl md:max-w-5xl";
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const router = useRouter();
  const hasBack = Boolean(onBack || backHref);

  const defaultTitle = useMemo(() => titleForPath(pathname), [pathname]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backHref) {
      setNavigating(true);
      router.push(backHref);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-neutral-100 md:ml-60">
        <div
          className={`relative flex items-center h-14 px-3 md:px-10 ${contentMaxClass} mx-auto`}
        >
          {hasBack ? (
            <button
              type="button"
              onClick={handleBack}
              aria-label="返回"
              className="w-10 h-10 inline-flex items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 transition"
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
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="開啟選單"
              className="md:hidden w-10 h-10 rounded-full flex items-center justify-center hover:bg-neutral-100 transition text-neutral-800"
            >
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                <path
                  d="M1 1H17M1 7H17M1 13H17"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-base font-semibold tracking-tight text-neutral-900 max-w-[55%] truncate text-center">
            {topbarTitle ?? defaultTitle}
          </span>
          <div className="ml-auto flex items-center justify-end">
            {topbarRight}
          </div>
        </div>
      </header>

      <SuperAdminSidebar />
      <SuperAdminMobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <main className="md:ml-60">
        <div className={`${contentMaxClass} mx-auto px-5 pt-6 pb-10 md:py-10`}>
          {children}
        </div>
      </main>

      <ScrollToTopButton lifted={scrollLifted} />

      {navigating && (
        <div className="fixed inset-0 z-[60] bg-white flex items-center justify-center">
          <div className="w-9 h-9 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
