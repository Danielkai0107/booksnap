"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import CloseButton from "./CloseButton";
import AdminSidebar, { AdminMobileMenu } from "./AdminSidebar";
import ScrollToTopButton from "./ScrollToTopButton";

type Props = {
  children: ReactNode;
  /**
   * 手機版頂部樣式：
   * - "topbar"：顯示漢堡 + logo + 右側操作（給 /admin 主頁用）
   * - "back"：左上角浮動 ← 圓鈕（給內頁用）
   */
  mobileMode?: "topbar" | "back";
  /** topbar 模式時右側按鈕（例：入庫） */
  topbarRight?: ReactNode;
  /** back 模式的回上頁路徑 */
  backHref?: string;
  /** 桌機內容區頂端的「← 返回」連結（詳情頁用） */
  desktopBack?: { href: string; label: string };
  /**
   * 自訂返回鍵行為（覆蓋 backHref / desktopBack 預設導航）。
   * 用於頁面內的 state 切換（例：標籤預覽切回選擇）。
   */
  onBack?: () => void;
  /**
   * 手機版有固定底部操作列時，把右下回頂按鈕往上抬以避免重疊。
   */
  scrollLifted?: boolean;
};

export default function AdminShell({
  children,
  mobileMode = "back",
  topbarRight,
  backHref,
  desktopBack,
  onBack,
  scrollLifted = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {mobileMode === "topbar" ? (
        <header className="md:hidden sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-neutral-100">
          <div className="flex items-center justify-between h-14 px-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="開啟選單"
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-neutral-100 transition text-neutral-800"
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
            <span className="text-base font-semibold tracking-tight text-neutral-900">
              booksnap
            </span>
            <div className="min-w-[40px] flex justify-end">{topbarRight}</div>
          </div>
        </header>
      ) : onBack ? (
        <CloseButton
          onClick={onBack}
          showLoadingOnClick={false}
          hideOnDesktop
          icon="arrow-left"
        />
      ) : backHref ? (
        <CloseButton href={backHref} hideOnDesktop icon="arrow-left" />
      ) : null}

      <AdminSidebar />
      <AdminMobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="md:ml-60">
        <div
          className={`max-w-2xl md:max-w-5xl mx-auto px-5 md:px-10 pb-10 md:py-10 ${
            mobileMode === "topbar" ? "pt-6" : "pt-20"
          }`}
        >
          {desktopBack && (
            <div className="hidden md:block mb-6">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="text-sm text-neutral-500 hover:text-neutral-900 transition"
                >
                  ← {desktopBack.label}
                </button>
              ) : (
                <Link
                  href={desktopBack.href}
                  className="text-sm text-neutral-500 hover:text-neutral-900 transition"
                >
                  ← {desktopBack.label}
                </Link>
              )}
            </div>
          )}
          {children}
        </div>
      </main>

      <ScrollToTopButton lifted={scrollLifted} />
    </div>
  );
}
