"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, BookRow, type CategoryRow } from "@/lib/supabase";
import AdminShell from "@/components/AdminShell";
import BookActionsMenu from "@/components/BookActionsMenu";
import BottomSheet from "@/components/BottomSheet";
import CategorySelect from "@/components/CategorySelect";
import CategoryTag from "@/components/CategoryTag";
import EditBookSheet from "@/components/EditBookSheet";
import SearchInput from "@/components/SearchInput";
import Toast, { type ToastKind } from "@/components/Toast";

type EditTarget = BookRow | null;

export default function AdminPage() {
  const router = useRouter();
  const [books, setBooks] = useState<BookRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "available" | "borrowed"
  >("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditTarget>(null);
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    kind: ToastKind;
  }>({ open: false, message: "", kind: "success" });

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  async function fetchAll() {
    setLoading(true);
    const [booksRes, membersRes, catRes] = await Promise.all([
      supabase
        .from("books")
        .select("*")
        .order("checkin_time", { ascending: false }),
      supabase.from("members").select("*", { count: "exact", head: true }),
      fetch("/api/categories", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ categories: [] })),
    ]);
    if (booksRes.error) {
      setErrorMsg(booksRes.error.message);
    } else {
      setBooks((booksRes.data ?? []) as BookRow[]);
    }
    setMemberCount(membersRes.count ?? 0);
    setCategories((catRes?.categories ?? []) as CategoryRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("pendingToast");
    if (!stored) return;
    sessionStorage.removeItem("pendingToast");
    try {
      const parsed = JSON.parse(stored) as {
        message?: string;
        kind?: ToastKind;
      };
      if (parsed.message) {
        setToast({
          open: true,
          message: parsed.message,
          kind: parsed.kind ?? "success",
        });
      }
    } catch {
      // ignore malformed payload
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (categoryFilter && b.category_id !== categoryFilter) return false;
      if (statusFilter && b.status !== statusFilter) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) || b.book_id.toLowerCase().includes(q)
      );
    });
  }, [books, query, categoryFilter, statusFilter]);

  const availableCount = books.filter((b) => b.status === "available").length;
  const borrowedCount = books.length - availableCount;

  return (
    <AdminShell
      mobileMode="topbar"
      topbarTitle="書籍管理"
      topbarRight={
        <a
          href="/api/export"
          className="press-feedback inline-flex items-center gap-1 text-sm font-medium text-neutral-800 hover:text-neutral-900 px-3 h-9 rounded-full bg-white border border-neutral-200 hover:border-neutral-400"
        >
          <svg
            width="14"
            height="14"
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
          <span className="leading-none">匯出</span>
        </a>
      }
    >
      {/* 桌機版頁面標題列；手機版標題已搬到 AdminShell topbar */}
      <header className="hidden md:flex mb-6 items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
          書籍管理
        </h1>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/checkin"
            className="press-feedback inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-3 rounded-xl"
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
            className="press-feedback inline-flex items-center gap-1.5 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-4 py-3 rounded-xl"
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

      <div className="mb-5 flex gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="搜尋書名或編號"
          wrapperClassName="flex-1 min-w-0"
          className="w-full h-[42px] px-4 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
        <div className="w-1/3 shrink-0">
          <CategorySelect
            sizeVariant="sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={categoryOptions}
            placeholder="全部"
          />
        </div>
      </div>
      <div className="mb-6 flex items-center gap-2">
        <StatusFilterChip
          active={statusFilter === ""}
          onClick={() => setStatusFilter("")}
        >
          全部
        </StatusFilterChip>
        <StatusFilterChip
          active={statusFilter === "available"}
          onClick={() => setStatusFilter("available")}
          dotColor="bg-emerald-500"
        >
          在庫
        </StatusFilterChip>
        <StatusFilterChip
          active={statusFilter === "borrowed"}
          onClick={() => setStatusFilter("borrowed")}
          dotColor="bg-neutral-400"
        >
          已借出
        </StatusFilterChip>
        <span className="ml-auto text-sm text-neutral-500">
          共 {filtered.length} 本
        </span>
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
                    <p className="font-medium text-neutral-900 truncate">
                      {b.title}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1 font-mono truncate">
                      {b.book_id}
                    </p>
                    {b.category_id && (
                      <div className="mt-1.5">
                        <CategoryTag
                          name={categoryNameById.get(b.category_id)}
                        />
                      </div>
                    )}
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
                        `/admin/books/${encodeURIComponent(b.book_id)}`,
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
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={b.image_url}
                            alt={b.title}
                            className="w-9 h-12 object-cover rounded border border-neutral-200 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-12 bg-neutral-100 rounded shrink-0" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-neutral-900 truncate">
                            {b.title}
                          </span>
                          {b.category_id && (
                            <span className="mt-1.5">
                              <CategoryTag
                                name={categoryNameById.get(b.category_id)}
                              />
                            </span>
                          )}
                        </div>
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
          className="press-feedback pointer-events-auto inline-flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-white text-base font-medium px-7 py-4 rounded-full shadow-lg shadow-neutral-900/20"
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
          categories={categories}
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
                      { method: "DELETE" },
                    );
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? `HTTP ${res.status}`);
                    }
                    void fetchAll();
                  } catch (err) {
                    alert(
                      `刪除失敗：${err instanceof Error ? err.message : String(err)}`,
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

      <Toast
        open={toast.open}
        message={toast.message}
        kind={toast.kind}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
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
      <span className="inline-flex items-center gap-1.5 h-[26px] text-xs px-2.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        在庫
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 h-[26px] text-xs px-2.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      已借出
    </span>
  );
}

function StatusFilterChip({
  active,
  onClick,
  dotColor,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dotColor?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-[26px] text-xs font-medium px-3 rounded-full border transition ${
        active
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
      }`}
    >
      {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      {children}
    </button>
  );
}
