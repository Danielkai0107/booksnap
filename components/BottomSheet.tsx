"use client";

import {
  ReactNode,
  TouchEvent as ReactTouchEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useKeyboardInset } from "@/lib/useKeyboardInset";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Maximum height of the panel (defaults to "90vh") */
  maxHeight?: string;
  /** Minimum height for the content area (defaults to "260px") */
  minContentHeight?: string;
};

/** 釋放時觸發關閉的最小下拉距離（px） */
const CLOSE_THRESHOLD_PX = 100;
/** 釋放時觸發關閉的最小速度（px/ms） */
const CLOSE_VELOCITY = 0.6;

export default function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeight = "90vh",
  minContentHeight = "260px",
}: Props) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const startTime = useRef(0);
  const lockedRef = useRef<"down" | "no" | null>(null);
  const draggingFromContent = useRef(false);
  const contentScrollAtStart = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  // 鍵盤打開時把 sheet 往上推同等距離，避免 input/footer 被遮住。
  const keyboardInset = useKeyboardInset(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Reset transient gesture state every time the sheet (re)opens.
  useEffect(() => {
    if (open) {
      setDragY(0);
      setClosing(false);
      lockedRef.current = null;
      startY.current = null;
    }
  }, [open]);

  if (!open) return null;

  function commitClose() {
    setClosing(true);
    // Let the panel slide out before unmounting via parent.
    window.setTimeout(() => {
      setDragY(0);
      setClosing(false);
      onClose();
    }, 200);
  }

  function handleTouchStart(e: ReactTouchEvent<HTMLDivElement>) {
    if (closing) return;
    const t = e.touches[0];
    startY.current = t.clientY;
    startTime.current = Date.now();
    lockedRef.current = null;
    const targetNode = e.target as Node;
    if (contentRef.current && contentRef.current.contains(targetNode)) {
      draggingFromContent.current = true;
      contentScrollAtStart.current = contentRef.current.scrollTop;
    } else {
      draggingFromContent.current = false;
      contentScrollAtStart.current = 0;
    }
  }

  function handleTouchMove(e: ReactTouchEvent<HTMLDivElement>) {
    if (startY.current === null || closing) return;
    const dy = e.touches[0].clientY - startY.current;

    if (lockedRef.current === null) {
      if (Math.abs(dy) < 6) return;
      if (dy < 0) {
        // 往上拉不關閉，讓內部滾動或瀏覽器原生行為接手。
        lockedRef.current = "no";
        return;
      }
      // 從內容區開始拖，且內容仍可往上滾，視為內容捲動而非關閉手勢。
      if (
        draggingFromContent.current &&
        (contentScrollAtStart.current > 0 ||
          (contentRef.current?.scrollTop ?? 0) > 0)
      ) {
        lockedRef.current = "no";
        return;
      }
      lockedRef.current = "down";
    }

    if (lockedRef.current !== "down") return;
    // 加一點阻力，下拉超過 200px 後位移趨緩。
    const eased = dy > 200 ? 200 + (dy - 200) * 0.4 : dy;
    setDragY(Math.max(0, eased));
  }

  function handleTouchEnd() {
    if (lockedRef.current === "down") {
      const elapsed = Math.max(1, Date.now() - startTime.current);
      const velocity = dragY / elapsed;
      if (dragY > CLOSE_THRESHOLD_PX || velocity > CLOSE_VELOCITY) {
        commitClose();
        startY.current = null;
        lockedRef.current = null;
        return;
      }
    }
    setDragY(0);
    startY.current = null;
    lockedRef.current = null;
  }

  const isDragging = dragY > 0 && !closing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      style={{
        paddingBottom: keyboardInset,
        transition: isDragging
          ? "none"
          : "padding-bottom 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
        style={{
          opacity: closing ? 0 : Math.max(0.2, 1 - dragY / 400),
          transition: isDragging
            ? "none"
            : "opacity 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full sm:max-w-md mx-auto bg-white rounded-t-3xl md:rounded-3xl md:my-8 shadow-2xl animate-slide-up md:animate-fade-in flex flex-col touch-pan-y"
        style={{
          maxHeight,
          transform: closing
            ? "translateY(100%)"
            : `translateY(${dragY}px)`,
          transition: isDragging
            ? "none"
            : "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="pt-2 pb-1 flex justify-center shrink-0 md:hidden cursor-grab active:cursor-grabbing">
          <span className="w-10 h-1 bg-neutral-200 rounded-full" />
        </div>
        {(title || subtitle) && (
          <header className="px-6 pt-4 md:pt-6 pb-3 shrink-0">
            {title && (
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-2 text-sm text-neutral-500">{subtitle}</p>
            )}
          </header>
        )}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-2 overscroll-contain"
          style={{ minHeight: minContentHeight }}
        >
          {children}
        </div>
        {footer && (
          <footer className="px-6 py-4 border-t border-neutral-100 shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
