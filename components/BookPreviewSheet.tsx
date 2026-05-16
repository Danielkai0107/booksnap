"use client";

import Link from "next/link";
import BottomSheet from "./BottomSheet";
import CategoryTag from "./CategoryTag";
import ZoomableImage from "./ZoomableImage";

export type BookPreview = {
  book_id: string;
  title: string;
  image_url: string | null;
  status: string | null;
  shelf_id: string | null;
  current_holder: string | null;
  admin_name: string | null;
  checkin_time: string | null;
  category_name: string | null;
  isbn?: string | null;
  authors?: string | null;
  publisher?: string | null;
  published_date?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  book: BookPreview | null;
  /** 「查看完整詳情」連結（後台用 /admin/books/[id]、前台用 /books/[id]）。 */
  detailHref?: string;
};

/**
 * Shared book preview sheet. Displays the same detail card layout used on
 * /books/[bookId] inside a bottom sheet, so other pages (e.g. 成員紀錄) can
 * peek at a referenced book without navigating away.
 */
export default function BookPreviewSheet({
  open,
  onClose,
  book,
  detailHref,
}: Props) {
  if (!book) return null;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="書籍資訊"
      subtitle={book.book_id}
      footer={
        detailHref ? (
          <Link
            href={detailHref}
            onClick={onClose}
            className="block w-full text-center bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
          >
            查看完整詳情
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
          >
            關閉
          </button>
        )
      }
    >
      <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-4 md:p-5 mb-2">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusPill status={book.status ?? "available"} />
          {book.category_name && <CategoryTag name={book.category_name} />}
          {book.shelf_id && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-white text-neutral-700 border border-neutral-200">
              書架 {book.shelf_id}
            </span>
          )}
        </div>
        <h2 className="text-base md:text-lg font-semibold tracking-tight text-neutral-900 leading-snug mb-4">
          {book.title}
        </h2>

        <div className="flex gap-4 items-stretch">
          {book.image_url ? (
            <ZoomableImage
              src={book.image_url}
              alt={book.title}
              className="w-20 md:w-24 self-stretch object-cover rounded-lg border border-neutral-200 shrink-0"
            />
          ) : (
            <div className="w-20 md:w-24 self-stretch rounded-lg bg-white border border-neutral-200 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-neutral-400 font-mono">{book.book_id}</p>
            {book.admin_name && (
              <p className="mt-2 text-xs text-neutral-500">
                入庫 · {book.admin_name}
              </p>
            )}
            {book.checkin_time && (
              <p className="text-xs text-neutral-500 tabular-nums mt-1">
                {new Date(book.checkin_time).toLocaleString("zh-TW")}
              </p>
            )}
            {book.current_holder && (
              <p className="mt-3 text-sm text-neutral-600">
                目前持有者：
                <span className="text-neutral-900 font-medium">
                  {book.current_holder}
                </span>
              </p>
            )}
          </div>
        </div>

        {(book.isbn ||
          book.authors ||
          book.publisher ||
          book.published_date) && (
          <dl className="mt-4 pt-3 border-t border-neutral-200 grid grid-cols-[80px_1fr] gap-y-1.5 text-xs">
            {book.isbn && (
              <>
                <dt className="text-neutral-500">ISBN</dt>
                <dd className="text-neutral-900 font-mono tabular-nums">
                  {book.isbn}
                </dd>
              </>
            )}
            {book.authors && (
              <>
                <dt className="text-neutral-500">作者</dt>
                <dd className="text-neutral-900">{book.authors}</dd>
              </>
            )}
            {book.publisher && (
              <>
                <dt className="text-neutral-500">出版社</dt>
                <dd className="text-neutral-900">{book.publisher}</dd>
              </>
            )}
            {book.published_date && (
              <>
                <dt className="text-neutral-500">出版日期</dt>
                <dd className="text-neutral-900 tabular-nums">
                  {book.published_date}
                </dd>
              </>
            )}
          </dl>
        )}
      </section>
    </BottomSheet>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        在庫
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-white text-neutral-700 border border-neutral-200 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      已借出
    </span>
  );
}
