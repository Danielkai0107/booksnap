"use client";

import { useEffect, useState } from "react";

/**
 * 偵測虛擬鍵盤把 viewport 推上去的高度（px）。
 *
 * 為何需要：iOS Safari 在虛擬鍵盤升起時，`window.innerHeight` 與
 * `100vh` 都不會變，導致 `position: fixed inset-0` 容器仍維持原本
 * 全螢幕高度；底部彈窗 / footer / input 因此會被鍵盤直接遮住，
 * 第一次 focus 也常常沒有 auto-scroll。
 *
 * `window.visualViewport` 則會反映「鍵盤升起後實際可見區域」，
 * 用它就能算出鍵盤實際吃掉多少高度，再把 sheet 容器 paddingBottom
 * 推同等距離，UI 就會自然往上移到鍵盤之上。
 *
 * - 不支援 visualViewport 的瀏覽器：永遠回傳 0，行為不變
 * - 沒鍵盤、桌機：回傳 0
 * - `enabled=false` 時不安裝 listener，並重置 inset 為 0
 */
export function useKeyboardInset(enabled: boolean = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      if (!vv) return;
      // 鍵盤吃掉的高度 = window 高度 − viewport 可見高度 − viewport 在頁面內的偏移
      const next = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(next);
    }

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [enabled]);

  return inset;
}
