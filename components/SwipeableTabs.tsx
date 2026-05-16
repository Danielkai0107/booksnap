"use client";

import {
  ReactNode,
  TouchEvent as ReactTouchEvent,
  useRef,
  useState,
} from "react";

export type SwipeableTab = {
  id: string;
  label: ReactNode;
  content: ReactNode;
};

type Props = {
  active: string;
  onChange: (id: string) => void;
  tabs: SwipeableTab[];
  /**
   * 內容區的最小高度。即使該 tab 沒有內容也要撐起來，讓使用者能在空白處
   * 完成左右滑動切換。預設 40vh。
   */
  minHeight?: string;
};

/**
 * 通用「左右滑動切換」分頁元件。
 * - 點 tab 按鈕：平滑切換
 * - 觸控左右拖曳：跟手 + 釋放後判斷是否切換
 * - 垂直滑動不會誤觸：以 |dx| > |dy| 判定為水平手勢
 * - 桌機（無 touch）行為與一般 tab 相同
 */
export default function SwipeableTabs({
  active,
  onChange,
  tabs,
  minHeight = "40vh",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const lockedHorizontal = useRef(false);
  const [dragX, setDragX] = useState<number | null>(null);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === active),
  );

  function handleTouchStart(e: ReactTouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    lockedHorizontal.current = false;
    setDragX(null);
  }

  function handleTouchMove(e: ReactTouchEvent<HTMLDivElement>) {
    if (startX.current === null || startY.current === null) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;

    if (!lockedHorizontal.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        lockedHorizontal.current = true;
      } else {
        startX.current = null;
        startY.current = null;
        return;
      }
    }

    let next = dx;
    if (activeIndex === 0 && next > 0) next = next * 0.3;
    if (activeIndex === tabs.length - 1 && next < 0) next = next * 0.3;
    setDragX(next);
  }

  function handleTouchEnd() {
    if (lockedHorizontal.current && dragX !== null) {
      const width = containerRef.current?.offsetWidth ?? 0;
      const threshold = Math.min(60, Math.max(30, width * 0.18));
      if (dragX > threshold && activeIndex > 0) {
        onChange(tabs[activeIndex - 1].id);
      } else if (dragX < -threshold && activeIndex < tabs.length - 1) {
        onChange(tabs[activeIndex + 1].id);
      }
    }
    setDragX(null);
    startX.current = null;
    startY.current = null;
    lockedHorizontal.current = false;
  }

  return (
    <section>
      <div className="flex gap-1 border-b border-neutral-200 mb-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              active === t.id
                ? "text-neutral-900 border-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden touch-pan-y select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          className={`flex ${
            dragX === null
              ? "transition-transform duration-300 ease-out"
              : ""
          }`}
          style={{
            transform: `translate3d(calc(${-activeIndex * 100}% + ${
              dragX ?? 0
            }px), 0, 0)`,
          }}
        >
          {tabs.map((t) => (
            <div
              key={t.id}
              className="w-full shrink-0"
              style={{ minHeight }}
              aria-hidden={t.id !== active}
            >
              {t.content}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
