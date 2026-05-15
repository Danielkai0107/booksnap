"use client";

import { ReactNode, useEffect } from "react";

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full sm:max-w-md mx-auto bg-white rounded-t-3xl md:rounded-3xl md:my-8 shadow-2xl animate-slide-up md:animate-fade-in flex flex-col"
        style={{ maxHeight }}
      >
        <div className="pt-2 pb-1 flex justify-center shrink-0 md:hidden">
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
          className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-2"
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
