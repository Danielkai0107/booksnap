"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * 路徑變更時把視窗滾回頂端。
 *
 * 為什麼存在：Next.js App Router 在大多數情況下會自動 scroll-to-top，但
 *  - 某些 server redirect / `router.replace` 場景不會
 *  - 主滾動容器若不是 window（例如 main 內套了 overflow:auto）也不會
 *
 * 用 `usePathname` 而不是 `useSearchParams`：
 *   只有真正換頁時才捲頂，相同 pathname 改 query（例如 `/?upgrade=1`）保留位置。
 *
 * 第一次掛載時不執行，避免：
 *   - 蓋掉瀏覽器的 anchor (`#section`) 跳轉
 *   - 對 SSR-hydrated 的初次頁面多做一次無謂的 scroll
 */
export default function ScrollToTopOnNavigate() {
  const pathname = usePathname();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
