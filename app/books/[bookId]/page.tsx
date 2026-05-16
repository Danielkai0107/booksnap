"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import CategoryTag from "@/components/CategoryTag";
import CloseButton from "@/components/CloseButton";
import MemberPreviewSheet from "@/components/MemberPreviewSheet";
import SwipeableTabs from "@/components/SwipeableTabs";
import ZoomableImage from "@/components/ZoomableImage";
import { BookRow, BorrowRecordRow, type CategoryRow } from "@/lib/supabase";

type Tab = "borrow" | "return";

export default function BookDetailPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = decodeURIComponent(params.bookId);
  const [book, setBook] = useState<BookRow | null>(null);
  const [records, setRecords] = useState<BorrowRecordRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("borrow");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewMember, setPreviewMember] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [bookRes, catRes] = await Promise.all([
          fetch(`/api/books/${encodeURIComponent(bookId)}`, {
            cache: "no-store",
          }),
          fetch("/api/categories", { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => ({ categories: [] })),
        ]);
        const data = await bookRes.json();
        if (!alive) return;
        if (!bookRes.ok)
          throw new Error(data.error ?? `HTTP ${bookRes.status}`);
        setBook(data.book as BookRow);
        setRecords((data.records ?? []) as BorrowRecordRow[]);
        setCategories((catRes?.categories ?? []) as CategoryRow[]);
      } catch (err) {
        if (!alive) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bookId]);

  const categoryName = useMemo(() => {
    if (!book?.category_id) return null;
    return categories.find((c) => c.id === book.category_id)?.name ?? null;
  }, [book, categories]);

  const returnedRecords = useMemo(
    () => records.filter((r) => r.returned_at),
    [records],
  );

  return (
    <main className="min-h-screen bg-white">
      <CloseButton href="/books" icon="arrow-left" ariaLabel="回書籍查詢" />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-20 pb-12">
        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
          </div>
        ) : errorMsg ? (
          <div className="px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
            {errorMsg}
          </div>
        ) : book ? (
          <>
            <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-5 md:p-7 mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <StatusPill status={book.status} />
                {categoryName && <CategoryTag name={categoryName} />}
                {book.shelf_id && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white text-neutral-700 border border-neutral-200">
                    書架 {book.shelf_id}
                  </span>
                )}
              </div>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-neutral-900 leading-snug mb-4">
                {book.title}
              </h1>

              <div className="flex gap-5 items-stretch">
                {book.image_url ? (
                  <ZoomableImage
                    src={book.image_url}
                    alt={book.title}
                    className="w-24 md:w-32 self-stretch object-cover rounded-lg border border-neutral-200 shrink-0"
                  />
                ) : (
                  <div className="w-24 md:w-32 self-stretch rounded-lg bg-white border border-neutral-200 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-neutral-400 font-mono">
                    {book.book_id}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    入庫 · {book.admin_name}
                  </p>
                  <p className="text-xs text-neutral-500 tabular-nums mt-1">
                    {new Date(book.checkin_time).toLocaleString("zh-TW")}
                  </p>
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

              <BookMetadata book={book} />
            </section>

            <SwipeableTabs
              active={tab}
              onChange={(id) => setTab(id as Tab)}
              tabs={[
                {
                  id: "borrow",
                  label: `借書紀錄 (${records.length})`,
                  content: (
                    <RecordList
                      records={records}
                      empty="尚無借書紀錄"
                      timeKey="borrowed_at"
                      timeLabel="借出時間"
                      onNameClick={setPreviewMember}
                    />
                  ),
                },
                {
                  id: "return",
                  label: `還書紀錄 (${returnedRecords.length})`,
                  content: (
                    <RecordList
                      records={returnedRecords}
                      empty="尚無還書紀錄"
                      timeKey="returned_at"
                      timeLabel="歸還時間"
                      onNameClick={setPreviewMember}
                    />
                  ),
                },
              ]}
            />
          </>
        ) : null}
      </div>

      <MemberPreviewSheet
        open={previewMember !== null}
        onClose={() => setPreviewMember(null)}
        name={previewMember}
        detailHref={
          previewMember
            ? `/members/${encodeURIComponent(previewMember)}`
            : undefined
        }
      />
    </main>
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

function BookMetadata({ book }: { book: BookRow }) {
  const hasAny =
    book.isbn || book.authors || book.publisher || book.published_date;
  if (!hasAny) return null;
  return (
    <dl className="mt-5 pt-4 border-t border-neutral-200 grid grid-cols-[72px_1fr] gap-y-2 text-xs md:text-sm">
      {book.isbn && (
        <>
          <dt className="text-neutral-400">ISBN</dt>
          <dd className="text-neutral-900 font-mono tabular-nums break-all">
            {book.isbn}
          </dd>
        </>
      )}
      {book.authors && (
        <>
          <dt className="text-neutral-400">作者</dt>
          <dd className="text-neutral-900">{book.authors}</dd>
        </>
      )}
      {book.publisher && (
        <>
          <dt className="text-neutral-400">出版社</dt>
          <dd className="text-neutral-900">{book.publisher}</dd>
        </>
      )}
      {book.published_date && (
        <>
          <dt className="text-neutral-400">出版日期</dt>
          <dd className="text-neutral-900 tabular-nums">
            {book.published_date}
          </dd>
        </>
      )}
    </dl>
  );
}

function RecordList({
  records,
  empty,
  timeKey,
  timeLabel,
  onNameClick,
}: {
  records: BorrowRecordRow[];
  empty: string;
  timeKey: "borrowed_at" | "returned_at";
  timeLabel: string;
  onNameClick: (name: string) => void;
}) {
  if (records.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">{empty}</p>
    );
  }
  return (
    <ul className="space-y-2">
      {records.map((r) => {
        const t = r[timeKey];
        return (
          <li
            key={r.id}
            className="px-4 py-3 flex items-center justify-between gap-3 bg-neutral-100 rounded-xl"
          >
            <button
              type="button"
              onClick={() => onNameClick(r.borrower_name)}
              className="text-sm font-medium text-neutral-900 hover:underline text-left"
            >
              {r.borrower_name}
            </button>
            <div className="text-xs text-neutral-500 tabular-nums mt-1 text-right">
              <span className="text-neutral-400">{timeLabel}</span>
              {t ? new Date(t).toLocaleString("zh-TW") : "—"}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
