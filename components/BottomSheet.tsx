"use client";

import { ReactNode, useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: string;
};

export default function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeight = "90vh",
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
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full sm:max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
        style={{ maxHeight }}
      >
        <div className="pt-2 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 bg-neutral-200 rounded-full" />
        </div>
        {(title || subtitle) && (
          <header className="px-6 pt-2 pb-3 shrink-0">
            {title && (
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
            )}
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-6 pb-2">{children}</div>
        {footer && (
          <footer className="px-6 py-4 border-t border-neutral-100 shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
