"use client";

import type React from "react";

/**
 * 共用桌機分頁器與分頁筆數控制。三個 admin 列表（書籍、出借人、標籤）共用，
 * 確保視覺一致；底層樣式跟原本 `app/(unit)/page.tsx` 的 inline 版本一樣。
 */

const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export const DESKTOP_PAGE_SIZE_OPTIONS = DEFAULT_PAGE_SIZE_OPTIONS;
export const DEFAULT_DESKTOP_PAGE_SIZE: number = DEFAULT_PAGE_SIZE_OPTIONS[0];

// 產生像 [1, '…', 4, 5, 6, '…', 12] 的頁碼序列。
// `siblings` 控制目前頁兩側顯示幾個頁碼；首尾固定顯示，避免頁數很多時
// 整列頁碼把分頁器撐爆。
function buildPageRange(
  page: number,
  totalPages: number,
  siblings = 1,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const first = 1;
  const last = totalPages;
  const left = Math.max(page - siblings, first + 1);
  const right = Math.min(page + siblings, last - 1);

  const items: Array<number | "ellipsis"> = [first];
  if (left > first + 1) items.push("ellipsis");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < last - 1) items.push("ellipsis");
  items.push(last);
  return items;
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  if (totalPages <= 1) {
    return <div className="h-9" aria-hidden />;
  }
  const items = buildPageRange(page, totalPages);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav className="flex items-center gap-1" aria-label="分頁">
      <PaginationButton
        onClick={() => onChange(page - 1)}
        disabled={prevDisabled}
        ariaLabel="上一頁"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </PaginationButton>

      {items.map((item, idx) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${idx}`}
            className="inline-flex h-9 min-w-9 items-center justify-center text-sm text-neutral-400"
          >
            …
          </span>
        ) : (
          <PaginationButton
            key={item}
            onClick={() => onChange(item)}
            active={item === page}
            ariaLabel={`第 ${item} 頁`}
          >
            <span className="tabular-nums">{item}</span>
          </PaginationButton>
        ),
      )}

      <PaginationButton
        onClick={() => onChange(page + 1)}
        disabled={nextDisabled}
        ariaLabel="下一頁"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </PaginationButton>
    </nav>
  );
}

function PaginationButton({
  children,
  onClick,
  disabled,
  active,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 min-w-9 items-center justify-center px-2.5 text-sm font-medium rounded-md border transition ${
        active
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200`}
    >
      {children}
    </button>
  );
}

/**
 * 桌機列表底部的「顯示 X–Y，共 N 筆 · 每頁 N 筆 + 頁碼」整列。
 * `unit` 是名詞單位（如「本」、「人」）。
 */
export function ListPagerBar({
  total,
  pageStart,
  pageEnd,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS as readonly number[],
  onPageSizeChange,
  page,
  totalPages,
  onPageChange,
  unit = "筆",
}: {
  total: number;
  pageStart: number;
  pageEnd: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange: (next: number) => void;
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  unit?: string;
}) {
  return (
    <div className="hidden md:flex mt-4 items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <span>
          顯示 {total === 0 ? 0 : pageStart + 1}–{pageEnd}，共 {total} {unit}
        </span>
        <span className="text-neutral-300">·</span>
        <label className="flex items-center gap-1.5">
          <span>每頁</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-700 focus:outline-none focus:border-neutral-900"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <span>{unit}</span>
        </label>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={onPageChange}
      />
    </div>
  );
}
