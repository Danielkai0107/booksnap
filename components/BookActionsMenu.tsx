"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onEdit: () => void;
  onDelete: () => void;
};

export default function BookActionsMenu({ onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-neutral-900 transition"
        aria-label="更多操作"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="3" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-32 bg-white border border-neutral-100 rounded-lg shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setOpen(false);
              onEdit();
            }}
            className="block w-full text-left px-3.5 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition"
          >
            編輯
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setOpen(false);
              onDelete();
            }}
            className="block w-full text-left px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition"
          >
            刪除
          </button>
        </div>
      )}
    </div>
  );
}
