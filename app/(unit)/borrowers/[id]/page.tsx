"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import BookPreviewSheet, {
  type BookPreview,
} from "@/components/BookPreviewSheet";
import BottomSheet from "@/components/BottomSheet";
import SwipeableTabs from "@/components/SwipeableTabs";
import { useToast } from "@/components/ToastProvider";
import { maskPhoneAdmin } from "@/lib/mask";

type Borrower = {
  id: string;
  phone: string;
  display_name: string;
  email: string | null;
  last_active_at: string | null;
  created_at: string;
};

type Holding = {
  book_id: string;
  title: string;
  image_url: string | null;
  current_location: string | null;
};

type BorrowRecord = {
  id: string;
  book_id: string;
  borrowed_at: string;
  returned_at: string | null;
  location_note: string | null;
};

type BookMap = Record<string, BookPreview>;

type Tab = "holding" | "borrow" | "return";

export default function BorrowerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(params.id);

  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [holding, setHolding] = useState<Holding[]>([]);
  const [records, setRecords] = useState<BorrowRecord[]>([]);
  const [books, setBooks] = useState<BookMap>({});
  const [previewBookId, setPreviewBookId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("holding");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const toast = useToast();

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/borrowers/${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBorrower(data.borrower as Borrower);
      const holdingData = (data.holding ?? []) as Holding[];
      setHolding(holdingData);
      setRecords((data.records ?? []) as BorrowRecord[]);
      const bookMap = { ...((data.books ?? {}) as BookMap) };
      for (const h of holdingData) {
        if (!bookMap[h.book_id]) {
          bookMap[h.book_id] = {
            book_id: h.book_id,
            title: h.title,
            image_url: h.image_url,
            status: "borrowed",
            shelf_id: null,
            current_holder: null,
            admin_name: null,
            checkin_time: null,
            category_name: null,
          };
        }
      }
      setBooks(bookMap);
    } catch (err) {
      console.error("[admin/borrowers/:id] fetch failed", err);
      toast.error("載入出借人資料失敗");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!borrower) return;
    setEditName(borrower.display_name);
    setEditEmail(borrower.email ?? "");
  }, [borrower]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/borrowers/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: editName.trim(),
            email: editEmail.trim() || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEditOpen(false);
      void fetchAll();
    } catch (err) {
      console.error("[admin/borrowers/:id] save failed", err);
      toast.error(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(
        `/api/admin/borrowers/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push("/borrowers");
    } catch (err) {
      console.error("[admin/borrowers/:id] delete failed", err);
      toast.error(err instanceof Error ? err.message : "刪除失敗");
    }
  }

  const returnedRecords = useMemo(
    () => records.filter((r) => r.returned_at),
    [records],
  );

  return (
    <AdminShell
      backHref="/borrowers"
      topbarTitle={borrower?.display_name ?? "出借人詳情"}
      scrollLifted
      topbarRight={
        // 桌機 only：手機已有底部固定的編輯/刪除動作列。
        borrower ? (
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="press-feedback inline-flex items-center gap-1 text-sm font-medium text-neutral-800 hover:text-neutral-900 bg-white border border-neutral-200 hover:border-neutral-400 px-3 h-9 rounded-full"
            >
              <span className="leading-none">編輯</span>
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="press-feedback inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700 bg-white border border-red-200 hover:border-red-300 px-3 h-9 rounded-full"
            >
              <span className="leading-none">刪除</span>
            </button>
          </div>
        ) : null
      }
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : borrower ? (
        <>
          {/* 桌機 2 欄：左圖卡 / 右 tabs；手機維持垂直堆疊。
              `md:items-start` 讓左欄保持原高度不被右欄撐高，
              `md:sticky md:top-20` 讓左欄跟著右側捲動保持可見。 */}
          <div className="md:grid md:grid-cols-[340px_1fr] md:gap-6 md:items-start">
            <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-5 md:p-7 mb-6 md:mb-0 md:sticky md:top-20">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-neutral-900">
                {borrower.display_name}
              </h1>
              <dl className="mt-3 grid grid-cols-[64px_1fr] gap-y-1.5 text-sm">
                <dt className="text-neutral-400">手機</dt>
                <dd className="text-neutral-900 font-mono">
                  {maskPhoneAdmin(borrower.phone)}
                </dd>
                {borrower.email && (
                  <>
                    <dt className="text-neutral-400">Email</dt>
                    <dd className="text-neutral-900 break-all">
                      {borrower.email}
                    </dd>
                  </>
                )}
                <dt className="text-neutral-400">加入</dt>
                <dd className="text-neutral-700 tabular-nums">
                  {new Date(borrower.created_at).toLocaleString("zh-TW")}
                </dd>
                {borrower.last_active_at && (
                  <>
                    <dt className="text-neutral-400">最近</dt>
                    <dd className="text-neutral-700 tabular-nums">
                      {new Date(borrower.last_active_at).toLocaleString(
                        "zh-TW",
                      )}
                    </dd>
                  </>
                )}
              </dl>
            </section>

            <div className="md:min-w-0">
              <SwipeableTabs
                active={tab}
                onChange={(t) => setTab(t as Tab)}
                tabs={[
                  {
                    id: "holding",
                    label: `持有中 (${holding.length})`,
                    content: (
                      <HoldingList
                        holding={holding}
                        onPreview={setPreviewBookId}
                        empty="目前沒有出借中的書"
                      />
                    ),
                  },
                  {
                    id: "borrow",
                    label: `出借紀錄 (${records.length})`,
                    content: (
                      <RecordList
                        records={records}
                        timeKey="borrowed_at"
                        timeLabel="借出"
                        books={books}
                        onPreview={setPreviewBookId}
                        empty="尚無出借紀錄"
                      />
                    ),
                  },
                  {
                    id: "return",
                    label: `歸還紀錄 (${returnedRecords.length})`,
                    content: (
                      <RecordList
                        records={returnedRecords}
                        timeKey="returned_at"
                        timeLabel="歸還"
                        books={books}
                        onPreview={setPreviewBookId}
                        empty="尚無歸還紀錄"
                      />
                    ),
                  },
                ]}
              />
            </div>
          </div>

          <div className="md:hidden h-24" aria-hidden />

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
              編輯
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-3 rounded-xl transition"
            >
              刪除
            </button>
          </div>

          <BookPreviewSheet
            open={previewBookId !== null}
            onClose={() => setPreviewBookId(null)}
            book={previewBookId ? (books[previewBookId] ?? null) : null}
            detailHref={
              previewBookId
                ? `/books/${encodeURIComponent(previewBookId)}`
                : undefined
            }
          />

          {editOpen && (
            <BottomSheet
              open
              onClose={() => setEditOpen(false)}
              title="編輯出借人"
              footer={
                <button
                  type="button"
                  disabled={saving || !editName.trim()}
                  onClick={handleSave}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-sm font-medium py-3 rounded-lg transition"
                >
                  {saving ? "儲存中..." : "儲存"}
                </button>
              }
            >
              <div className="space-y-3 pb-2">
                <label className="block">
                  <span className="text-xs text-neutral-500">姓名</span>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-900"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-neutral-500">
                    Email（可選）
                  </span>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-neutral-900"
                  />
                </label>
                <p className="text-xs text-neutral-400">
                  手機號碼是出借人的唯一識別，不可在後台修改。
                </p>
              </div>
            </BottomSheet>
          )}

          {deleteOpen && (
            <BottomSheet
              open
              onClose={() => setDeleteOpen(false)}
              title="刪除出借人？"
              subtitle={`此操作無法復原（${borrower.display_name}）`}
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
                該出借人下次在 /o/&#123;slug&#125;
                出借時會重新建檔。已歸還的紀錄會一併刪除。
              </p>
            </BottomSheet>
          )}
        </>
      ) : (
        <div className="py-20 text-center text-sm text-neutral-500">
          找不到此出借人
        </div>
      )}
    </AdminShell>
  );
}

function HoldingList({
  holding,
  onPreview,
  empty,
}: {
  holding: Holding[];
  onPreview: (bookId: string) => void;
  empty: string;
}) {
  if (holding.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">{empty}</p>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
      {holding.map((b) => (
        <li key={b.book_id} className="py-3">
          <button
            type="button"
            onClick={() => onPreview(b.book_id)}
            className="press-feedback w-full flex items-start gap-3 text-left"
          >
            {b.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.image_url}
                alt={b.title}
                className="w-12 h-16 object-cover rounded border border-neutral-200 shrink-0"
              />
            ) : (
              <div className="w-12 h-16 bg-neutral-100 rounded shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-neutral-900 truncate">{b.title}</p>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                {b.book_id}
              </p>
              {b.current_location && (
                <p className="text-xs text-neutral-500 mt-0.5 truncate">
                  使用地點 · {b.current_location}
                </p>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecordList({
  records,
  timeKey,
  timeLabel,
  books,
  onPreview,
  empty,
}: {
  records: BorrowRecord[];
  timeKey: "borrowed_at" | "returned_at";
  timeLabel: string;
  books: BookMap;
  onPreview: (bookId: string) => void;
  empty: string;
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
        const book = books[r.book_id];
        return (
          <li
            key={r.id}
            className="px-4 py-3 bg-neutral-100 rounded-xl flex items-center justify-between gap-3"
          >
            <button
              type="button"
              onClick={() => onPreview(r.book_id)}
              className="text-sm font-medium text-neutral-900 hover:underline text-left min-w-0 truncate"
            >
              {book?.title ?? r.book_id}
            </button>
            <div className="text-xs text-neutral-500 tabular-nums text-right shrink-0">
              <span className="text-neutral-400">{timeLabel} </span>
              {t ? new Date(t).toLocaleString("zh-TW") : "—"}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
