"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import BookPreviewSheet, {
  type BookPreview,
} from "@/components/BookPreviewSheet";
import BottomSheet from "@/components/BottomSheet";
import SwipeableTabs from "@/components/SwipeableTabs";
import { useToast } from "@/components/ToastProvider";
import { BorrowRecordRow, MemberRow } from "@/lib/supabase";

type Tab = "holding" | "borrow" | "return";

type Holding = {
  book_id: string;
  title: string;
  image_url: string | null;
};

type BookMap = Record<string, BookPreview>;

export default function MemberDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const name = decodeURIComponent(params.name);

  const [member, setMember] = useState<MemberRow | null>(null);
  const [holding, setHolding] = useState<Holding[]>([]);
  const [records, setRecords] = useState<BorrowRecordRow[]>([]);
  const [books, setBooks] = useState<BookMap>({});
  const [previewBookId, setPreviewBookId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("holding");
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/members/${encodeURIComponent(name)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setMember(data.member as MemberRow);
        const holdingData = (data.holding ?? []) as Holding[];
        setHolding(holdingData);
        setRecords((data.records ?? []) as BorrowRecordRow[]);
        // 把目前持有合進 books map，這樣即使該書沒有借閱紀錄也能展開預覽。
        const bookMap = { ...((data.books ?? {}) as BookMap) };
        for (const h of holdingData) {
          if (!bookMap[h.book_id]) {
            bookMap[h.book_id] = {
              book_id: h.book_id,
              title: h.title,
              image_url: h.image_url,
              status: "borrowed",
              shelf_id: null,
              current_holder: name,
              admin_name: null,
              checkin_time: null,
              category_name: null,
            };
          }
        }
        setBooks(bookMap);
      } catch (err) {
        if (!alive) return;
        console.error("[admin/members/:name] fetch failed", err);
        toast.error("載入成員資料失敗");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [name, toast]);

  const previewBook = previewBookId ? (books[previewBookId] ?? null) : null;

  const returnedRecords = useMemo(
    () => records.filter((r) => r.returned_at),
    [records],
  );

  const lastAction = records[0] ?? null;

  async function handleEdit() {
    const trimmed = editName.trim();
    if (!trimmed || editSaving) return;
    if (trimmed === name) {
      setEditOpen(false);
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.replace(`/admin/members/${encodeURIComponent(trimmed)}`);
    } catch (err) {
      console.error("[admin/members/:name] rename failed", err);
      toast.error("修改失敗，請稍後再試");
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push("/admin/members");
    } catch (err) {
      console.error("[admin/members/:name] delete failed", err);
      toast.error("刪除失敗，請稍後再試");
    }
  }

  return (
    <AdminShell
      backHref="/admin/members"
      desktopBack={{ href: "/admin/members", label: "回成員列表" }}
      scrollLifted
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : member ? (
        <>
          <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-5 md:p-7 mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
                  {member.name}
                </h1>
                <p className="mt-1 text-xs text-neutral-500">
                  加入時間 ·{" "}
                  {new Date(member.created_at).toLocaleString("zh-TW")}
                </p>
                {lastAction && (
                  <p className="mt-2 text-xs text-neutral-500">
                    最近動作 ·{" "}
                    {lastAction.returned_at
                      ? `${new Date(lastAction.returned_at).toLocaleString("zh-TW")} 歸還`
                      : `${new Date(lastAction.borrowed_at).toLocaleString("zh-TW")} 借出`}
                  </p>
                )}
              </div>
              {/* 桌機顯示右上角操作；手機改為底部固定按鈕 */}
              <div className="hidden md:flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditName(member.name);
                    setEditOpen(true);
                  }}
                  className="text-xs text-neutral-700 hover:text-neutral-900 px-3 py-1.5 rounded-md border border-neutral-200 hover:border-neutral-400 transition"
                >
                  編輯姓名
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="text-xs text-red-600 hover:text-red-700 px-3 py-1.5 rounded-md border border-red-100 hover:border-red-200 transition"
                >
                  刪除成員
                </button>
              </div>
            </div>
          </section>

          <SwipeableTabs
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            tabs={[
              {
                id: "holding",
                label: `目前持有 (${holding.length})`,
                content: (
                  <HoldingList
                    items={holding}
                    onPick={(bookId) => setPreviewBookId(bookId)}
                  />
                ),
              },
              {
                id: "borrow",
                label: `借書紀錄 (${records.length})`,
                content: (
                  <RecordList
                    records={records}
                    books={books}
                    empty="尚無借書紀錄"
                    timeKey="borrowed_at"
                    timeLabel="借出時間"
                    onPick={(bookId) => setPreviewBookId(bookId)}
                  />
                ),
              },
              {
                id: "return",
                label: `還書紀錄 (${returnedRecords.length})`,
                content: (
                  <RecordList
                    records={returnedRecords}
                    books={books}
                    empty="尚無還書紀錄"
                    timeKey="returned_at"
                    timeLabel="歸還時間"
                    onPick={(bookId) => setPreviewBookId(bookId)}
                  />
                ),
              },
            ]}
          />

          <BookPreviewSheet
            open={!!previewBookId && !!previewBook}
            onClose={() => setPreviewBookId(null)}
            book={previewBook}
            detailHref={
              previewBookId
                ? `/admin/books/${encodeURIComponent(previewBookId)}`
                : undefined
            }
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
              onClick={() => {
                setEditName(member.name);
                setEditOpen(true);
              }}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-xl transition"
            >
              編輯姓名
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-3 rounded-xl transition"
            >
              刪除成員
            </button>
          </div>

          {editOpen && (
            <BottomSheet
              open
              onClose={() => {
                if (editSaving) return;
                setEditOpen(false);
              }}
              title="編輯成員姓名"
              subtitle="同步更新書本持有人與借閱紀錄"
              footer={
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditOpen(false)}
                    disabled={editSaving}
                    className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition disabled:opacity-60"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleEdit}
                    disabled={
                      editSaving ||
                      !editName.trim() ||
                      editName.trim() === member.name
                    }
                    className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition disabled:bg-neutral-300"
                  >
                    {editSaving ? "儲存中" : "儲存"}
                  </button>
                </div>
              }
            >
              <div className="pb-4">
                <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                  姓名
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleEdit();
                  }}
                />
              </div>
            </BottomSheet>
          )}

          {deleteOpen && (
            <BottomSheet
              open
              onClose={() => setDeleteOpen(false)}
              title="刪除成員？"
              subtitle="此操作無法復原"
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
                成員「{member.name}」將從系統移除。
                {holding.length > 0 &&
                  "因目前仍有借出未還的書，請先完成歸還才能刪除。"}
              </p>
            </BottomSheet>
          )}
        </>
      ) : (
        <div className="py-20 text-center text-sm text-neutral-500">
          找不到此成員，或載入失敗
        </div>
      )}
    </AdminShell>
  );
}

function HoldingList({
  items,
  onPick,
}: {
  items: Holding[];
  onPick: (bookId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">
        目前沒有持有任何書本
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((b) => (
        <li key={b.book_id} className="bg-neutral-100 rounded-xl">
          <button
            type="button"
            onClick={() => onPick(b.book_id)}
            className="w-full flex gap-3 items-center p-3 text-left hover:bg-neutral-200 transition rounded-xl"
          >
            {b.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.image_url}
                alt={b.title}
                className="w-12 h-16 object-cover rounded-md border border-neutral-200 shrink-0"
              />
            ) : (
              <div className="w-12 h-16 bg-white rounded-md border border-neutral-200 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {b.title}
              </p>
              <p className="text-xs text-neutral-400 mt-1 font-mono truncate">
                {b.book_id}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecordList({
  records,
  books,
  empty,
  timeKey,
  timeLabel,
  onPick,
}: {
  records: BorrowRecordRow[];
  books: BookMap;
  empty: string;
  timeKey: "borrowed_at" | "returned_at";
  timeLabel: string;
  onPick: (bookId: string) => void;
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
        const title = books[r.book_id]?.title ?? r.book_id;
        return (
          <li
            key={r.id}
            className="px-4 py-3 flex items-start justify-between gap-3 bg-neutral-100 rounded-xl"
          >
            <button
              type="button"
              onClick={() => onPick(r.book_id)}
              className="flex-1 min-w-0 text-left text-sm font-medium text-neutral-900 hover:underline line-clamp-2 leading-snug"
            >
              {title}
            </button>
            <div className="text-xs text-neutral-500 tabular-nums mt-1 text-right shrink-0">
              <p className="text-neutral-400">{timeLabel}</p>
              <p className="mt-0.5">
                {t ? new Date(t).toLocaleString("zh-TW") : "—"}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
