"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import BottomSheet from "@/components/BottomSheet";
import CategoryTag from "@/components/CategoryTag";
import EditBookSheet from "@/components/EditBookSheet";
import MemberPreviewSheet from "@/components/MemberPreviewSheet";
import SwipeableTabs from "@/components/SwipeableTabs";
import { useToast } from "@/components/ToastProvider";
import ZoomableImage from "@/components/ZoomableImage";
import { BookRow, BorrowRecordRow, type CategoryRow } from "@/lib/supabase";

type Tab = "borrow" | "return";

export default function BookDetailPage() {
  const router = useRouter();
  const params = useParams<{ bookId: string }>();
  const bookId = decodeURIComponent(params.bookId);
  const [book, setBook] = useState<BookRow | null>(null);
  const [records, setRecords] = useState<BorrowRecordRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("borrow");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewMember, setPreviewMember] = useState<string | null>(null);
  const toast = useToast();

  const fetchBook = useCallback(async () => {
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
      if (!bookRes.ok) throw new Error(data.error ?? `HTTP ${bookRes.status}`);
      setBook(data.book as BookRow);
      setRecords((data.records ?? []) as BorrowRecordRow[]);
      setCategories((catRes?.categories ?? []) as CategoryRow[]);
    } catch (err) {
      console.error("[admin/books/:id] fetch failed", err);
      toast.error("載入書籍失敗");
    } finally {
      setLoading(false);
    }
  }, [bookId, toast]);

  useEffect(() => {
    void fetchBook();
  }, [fetchBook]);

  async function handleDelete() {
    try {
      const res = await fetch(`/api/books/${encodeURIComponent(bookId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push("/admin");
    } catch (err) {
      console.error("[admin/books/:id] delete failed", err);
      toast.error("刪除失敗，請稍後再試");
    }
  }

  const categoryName = useMemo(() => {
    if (!book?.category_id) return null;
    return categories.find((c) => c.id === book.category_id)?.name ?? null;
  }, [book, categories]);

  const returnedRecords = useMemo(
    () => records.filter((r) => r.returned_at),
    [records],
  );

  return (
    <AdminShell
      backHref="/admin"
      desktopBack={{ href: "/admin", label: "回書籍列表" }}
      scrollLifted
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : book ? (
        <>
          <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-5 md:p-7 mb-8">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <StatusPill status={book.status} />
              {categoryName && <CategoryTag name={categoryName} />}
              {book.shelf_id && (
                <span className="inline-flex items-center h-[26px] text-xs px-2.5 rounded-full bg-white text-neutral-700 border border-neutral-200">
                  書架 {book.shelf_id}
                </span>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-neutral-900 leading-snug mb-4">
              {book.title}
            </h1>

            {/* 桌機編輯/刪除按鈕 */}
            <div className="hidden md:flex justify-end gap-2 mb-4">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="text-xs text-neutral-700 hover:text-neutral-900 px-3 py-1.5 rounded-md border border-neutral-200 hover:border-neutral-400 transition"
              >
                編輯書本
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="text-xs text-red-600 hover:text-red-700 px-3 py-1.5 rounded-md border border-red-100 hover:border-red-200 transition"
              >
                刪除書本
              </button>
            </div>

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

          {/* 手機版底部留白，避免被固定按鈕遮擋 */}
          <div className="md:hidden h-24" aria-hidden />

          {/* 手機版固定底部編輯/刪除按鈕 */}
          <div
            className="md:hidden fixed inset-x-0 bottom-0 z-40 px-5 pt-3 flex gap-3 bg-white border-t border-neutral-100"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
            }}
          >
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-xl transition"
            >
              編輯書本
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-3 rounded-xl transition"
            >
              刪除書本
            </button>
          </div>

          <MemberPreviewSheet
            open={previewMember !== null}
            onClose={() => setPreviewMember(null)}
            name={previewMember}
            detailHref={
              previewMember
                ? `/admin/members/${encodeURIComponent(previewMember)}`
                : undefined
            }
          />

          {editOpen && (
            <EditBookSheet
              book={book}
              categories={categories}
              onClose={() => setEditOpen(false)}
              onSaved={() => {
                setEditOpen(false);
                void fetchBook();
              }}
            />
          )}

          {deleteOpen && (
            <BottomSheet
              open
              onClose={() => setDeleteOpen(false)}
              title="刪除書本？"
              subtitle={`此操作無法復原（${book.book_id}）`}
              footer={
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteOpen(false)}
                    className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-3 rounded-lg transition"
                  >
                    確認刪除
                  </button>
                </div>
              }
            >
              <p className="text-sm text-neutral-600 pb-4">
                《{book.title}》將從館藏中移除，同時會刪掉相關借還紀錄。
              </p>
            </BottomSheet>
          )}
        </>
      ) : (
        <div className="py-20 text-center text-sm text-neutral-500">
          找不到此書籍，或載入失敗
        </div>
      )}
    </AdminShell>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 h-[26px] text-xs px-2.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        在庫
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 h-[26px] text-xs px-2.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium">
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
