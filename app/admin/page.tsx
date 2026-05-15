"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, BookRow } from "@/lib/supabase";
import AdminShell from "@/components/AdminShell";
import BookActionsMenu from "@/components/BookActionsMenu";
import BottomSheet from "@/components/BottomSheet";
import ZoomableImage from "@/components/ZoomableImage";

type EditTarget = BookRow | null;

export default function AdminPage() {
  const router = useRouter();
  const [books, setBooks] = useState<BookRow[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditTarget>(null);

  async function fetchAll() {
    setLoading(true);
    const [booksRes, membersRes] = await Promise.all([
      supabase
        .from("books")
        .select("*")
        .order("checkin_time", { ascending: false }),
      supabase.from("members").select("*", { count: "exact", head: true }),
    ]);
    if (booksRes.error) {
      setErrorMsg(booksRes.error.message);
    } else {
      setBooks((booksRes.data ?? []) as BookRow[]);
    }
    setMemberCount(membersRes.count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.book_id.toLowerCase().includes(q)
    );
  }, [books, query]);

  const availableCount = books.filter((b) => b.status === "available").length;
  const borrowedCount = books.length - availableCount;

  return (
    <AdminShell mobileMode="topbar">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
          書籍庫存
        </h1>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/checkin"
            className="hidden md:inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-3 rounded-xl transition"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="leading-none">新書入庫</span>
          </Link>
          <a
            href="/api/export"
            className="inline-flex items-center gap-1.5 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-4 py-3 rounded-xl transition"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="leading-none">下載 Excel</span>
          </a>
        </div>
      </header>

      <dl className="mb-6 grid grid-cols-4 divide-x divide-neutral-200 border border-neutral-200 rounded-xl p-3 bg-neutral-100">
        <Stat label="總書籍" value={books.length} />
        <Stat label="在庫" value={availableCount} />
        <Stat label="已借出" value={borrowedCount} />
        <Stat label="成員數" value={memberCount} />
      </dl>

      <div className="mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋書名或編號"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </div>

      {errorMsg && (
        <div className="mb-6 px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-sm text-neutral-500">
            {books.length === 0 ? "尚無書籍資料" : "沒有符合的書"}
          </p>
        </div>
      ) : (
        <>
          {/* 手機卡片 */}
          <ul className="md:hidden divide-y divide-neutral-100 border-y border-neutral-100">
            {filtered.map((b) => (
              <li key={b.id} className="py-4 flex gap-3 items-start">
                <Link
                  href={`/admin/books/${encodeURIComponent(b.book_id)}`}
                  className="flex-1 flex gap-3 items-start min-w-0"
                >
                  {b.image_url ? (
                    <ZoomableImage
                      src={b.image_url}
                      alt={b.title}
                      className="w-12 h-16 object-cover rounded border border-neutral-200"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-neutral-100 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-neutral-900 truncate">
                      {b.title}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1 font-mono">
                      {b.book_id}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <span className="text-xs text-neutral-500 truncate min-w-0">
                        {b.current_holder ?? ""}
                      </span>
                      <span className="shrink-0">
                        <StatusPill status={b.status} />
                      </span>
                    </div>
                  </div>
                </Link>
                <BookActionsMenu
                  onEdit={() => setEditTarget(b)}
                  onDelete={() => setDeleteTarget(b)}
                />
              </li>
            ))}
          </ul>

          {/* 桌機表格 */}
          <div className="hidden md:block overflow-x-auto border border-neutral-100 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50/60 text-neutral-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">編號</th>
                  <th className="text-left px-5 py-3 font-medium">書名</th>
                  <th className="text-left px-5 py-3 font-medium">入庫人員</th>
                  <th className="text-left px-5 py-3 font-medium">入庫時間</th>
                  <th className="text-left px-5 py-3 font-medium">狀態</th>
                  <th className="text-left px-5 py-3 font-medium">持有人</th>
                  <th className="px-3 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() =>
                      router.push(
                        `/admin/books/${encodeURIComponent(b.book_id)}`
                      )
                    }
                    className="hover:bg-neutral-50/60 transition cursor-pointer"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-neutral-500">
                      {b.book_id}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {b.image_url ? (
                          <ZoomableImage
                            src={b.image_url}
                            alt={b.title}
                            className="w-9 h-12 object-cover rounded border border-neutral-200"
                          />
                        ) : (
                          <div className="w-9 h-12 bg-neutral-100 rounded" />
                        )}
                        <span className="text-neutral-900">{b.title}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-neutral-700">
                      {b.admin_name}
                    </td>
                    <td className="px-5 py-3.5 text-neutral-500 tabular-nums">
                      {new Date(b.checkin_time).toLocaleString("zh-TW", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill status={b.status} />
                    </td>
                    <td className="px-5 py-3.5 text-neutral-700">
                      {b.current_holder ?? "—"}
                    </td>
                    <td className="px-3 py-3.5">
                      <div onClick={(e) => e.stopPropagation()}>
                        <BookActionsMenu
                          onEdit={() => setEditTarget(b)}
                          onDelete={() => setDeleteTarget(b)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 手機版底部留白，避免列表被浮動按鈕遮擋 */}
      <div className="md:hidden h-24" aria-hidden />

      {/* 手機版底部固定「新書入庫」按鈕 */}
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-40 px-5 pt-6 flex justify-center pointer-events-none bg-gradient-to-t from-white via-white/95 to-white/0"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <Link
          href="/checkin"
          className="pointer-events-auto inline-flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-white text-base font-medium px-7 py-4 rounded-full shadow-lg shadow-neutral-900/20 transition"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="leading-none">新書入庫</span>
        </Link>
      </div>

      {editTarget && (
        <EditBookSheet
          book={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void fetchAll();
          }}
        />
      )}

      {deleteTarget && (
        <BottomSheet
          open
          onClose={() => setDeleteTarget(null)}
          title="刪除書本？"
          subtitle={`此操作無法復原（${deleteTarget.book_id}）`}
          footer={
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  try {
                    const res = await fetch(
                      `/api/books/${encodeURIComponent(target.book_id)}`,
                      { method: "DELETE" }
                    );
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? `HTTP ${res.status}`);
                    }
                    void fetchAll();
                  } catch (err) {
                    alert(
                      `刪除失敗：${err instanceof Error ? err.message : String(err)}`
                    );
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-3 rounded-lg transition"
              >
                確認刪除
              </button>
            </div>
          }
        >
          <p className="text-sm text-neutral-600 pb-4">
            《{deleteTarget.title}》將從館藏中移除，同時會刪掉相關借還紀錄。
          </p>
        </BottomSheet>
      )}
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 md:px-4 text-center md:text-left">
      <dt className="text-[11px] md:text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-lg md:text-2xl font-semibold tracking-tight text-neutral-900 tabular-nums">
        {value}
      </dd>
    </div>
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
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      已借出
    </span>
  );
}

function EditBookSheet({
  book,
  onClose,
  onSaved,
}: {
  book: BookRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(book.title);
  const [shelfId, setShelfId] = useState(book.shelf_id ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/books/${encodeURIComponent(book.book_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            shelf_id: shelfId.trim() || null,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      alert(`儲存失敗：${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="編輯書本"
      subtitle={book.book_id}
      footer={
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition disabled:bg-neutral-300"
          >
            {saving ? "儲存中" : "儲存"}
          </button>
        </div>
      }
    >
      <div className="flex gap-4 items-start pb-3">
        {book.image_url ? (
          <ZoomableImage
            src={book.image_url}
            alt={book.title}
            className="w-20 h-28 object-cover rounded-md border border-neutral-100"
          />
        ) : (
          <div className="w-20 h-28 rounded-md bg-neutral-100" />
        )}
        <div className="flex-1 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              書名
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              書架位置
            </label>
            <input
              type="text"
              value={shelfId}
              onChange={(e) => setShelfId(e.target.value)}
              placeholder="（選填）"
              className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
            />
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
