"use client";

import { useEffect, useState, MouseEvent } from "react";
import { createPortal } from "react-dom";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "onClick"> & {
  /**
   * 放大後顯示的圖片來源，若不指定則使用 `src`。
   * 適用於縮圖與原圖不同時。
   */
  zoomSrc?: string;
};

export default function ZoomableImage({
  src,
  zoomSrc,
  alt = "",
  className,
  ...rest
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    // Capture so Escape closes the image before a parent sheet handles it.
    document.addEventListener("keydown", onKey, { capture: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, { capture: true });
      document.body.style.overflow = prev;
    };
  }, [open]);

  function handleClick(e: MouseEvent<HTMLImageElement>) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  const finalZoomSrc = zoomSrc ?? (typeof src === "string" ? src : undefined);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`cursor-zoom-in ${className ?? ""}`}
        onClick={handleClick}
        {...rest}
      />
      {open &&
        finalZoomSrc &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out select-none"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="圖片預覽"
          >
            <img
              src={finalZoomSrc}
              alt={alt}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              aria-label="關閉預覽"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white flex items-center justify-center transition"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 1L13 13M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
