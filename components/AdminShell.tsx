"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar, { AdminMobileMenu } from "./AdminSidebar";
import ScrollToTopButton from "./ScrollToTopButton";

// `UpgradeModalProvider` 掛在 `app/(unit)/layout.tsx`，覆蓋整個 unit route
// group。寫在這裡會比 page component 還內層，導致 page 自己 useUpgradeModal()
// 拿到 no-op fallback，新書入庫等入口的升級彈窗就會默默壞掉。

type Props = {
  children: ReactNode;
  /**
   * Topbar 中央標題。預設 "booksnap"。絕對置中，左右兩側元素變寬不會
   * 影響它的位置。
   */
  topbarTitle?: ReactNode;
  /** Topbar 右側操作（例：匯出、新增） */
  topbarRight?: ReactNode;
  /**
   * 設置後 topbar 左側顯示「返回箭頭」（覆寫預設的漢堡按鈕）。
   * 與 `onBack` 二擇一；若兩者都有，`onBack` 優先。
   */
  backHref?: string;
  /**
   * 自訂返回鍵行為，會覆寫 `backHref`。常見場景是頁面內 state 切換
   *（例：標籤預覽切回選擇）；點下後不會走 router.push。
   */
  onBack?: () => void;
  /**
   * 手機版有固定底部操作列時，把右下回頂按鈕往上抬以避免重疊。
   */
  scrollLifted?: boolean;
};

/**
 * Admin 全站 shell：常駐桌機側欄 + 統一 topbar。
 *
 * Topbar 左側按鈕由 props 推導：
 * - 有 `backHref`/`onBack` → 返回箭頭（手機/桌機都顯示），樣式與
 *   公開頁 `BrandedBackButton` 一致。
 * - 沒有 → 漢堡（只手機顯示，用來開 mobile drawer；桌機側欄常駐
 *   不需漢堡）。
 *
 * 標題絕對置中，不論左右元素寬度都不會影響視覺中心。
 */
export default function AdminShell({
  children,
  topbarTitle,
  topbarRight,
  backHref,
  onBack,
  scrollLifted = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const router = useRouter();
  const hasBack = Boolean(onBack || backHref);

  // 返回行為：onBack 優先（純 client state 切換，不導頁），
  // 否則用 router.push 並打開 fullscreen loading 蓋住閃白，
  // 行為對齊舊版 CloseButton 在 backHref 模式下的 UX。
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
        <div className="relative flex items-center h-14 px-3 md:px-10 max-w-2xl md:max-w-5xl mx-auto">
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
            {topbarTitle ?? "booksnap"}
          </span>
          <div className="ml-auto flex items-center justify-end">
            {topbarRight}
          </div>
        </div>
      </header>

      <AdminSidebar />
      <AdminMobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="md:ml-60">
        <div className="max-w-2xl md:max-w-5xl mx-auto px-5 md:px-10 pt-6 pb-10 md:py-10">
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
