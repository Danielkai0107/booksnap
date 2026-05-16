"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import LabelCard from "@/components/LabelCard";
import SearchInput from "@/components/SearchInput";
import { useToast } from "@/components/ToastProvider";
import ZoomableImage from "@/components/ZoomableImage";
import { supabase, BookRow } from "@/lib/supabase";

export default function LabelsPage() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showLabels, setShowLabels] = useState(false);
  const [loading, setLoading] = useState(true);
  /**
   * Public slug used to build the QR target URL on each printed label. We
   * fetch it once via `/api/me` instead of plumbing it down from a server
   * component because this page is "use client" end-to-end.
   */
  const [slug, setSlug] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data, error }, meRes] = await Promise.all([
        supabase
          .from("books")
          .select("*")
          .order("checkin_time", { ascending: false }),
        fetch("/api/me", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      if (!alive) return;
      if (error) {
        console.error("[admin/labels] fetch failed", error);
        toast.error("載入書籍清單失敗");
      } else {
        setBooks((data ?? []) as BookRow[]);
      }
      if (meRes && typeof meRes.publicSlug === "string") {
        setSlug(meRes.publicSlug as string);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.book_id.toLowerCase().includes(q),
    );
  }, [books, query]);

  const selectedBooks = useMemo(
    () => books.filter((b) => selected.has(b.book_id)),
    [books, selected],
  );

  function toggle(bookId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }

  function selectAll(visible: BookRow[]) {
    setSelected(new Set(visible.map((b) => b.book_id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  if (showLabels) {
    return (
      <AdminShell
        onBack={() => setShowLabels(false)}
        desktopBack={{ href: "/admin/labels", label: "回選擇" }}
      >
        <div className="no-print mb-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
              標籤預覽
            </h1>
            <button
              type="button"
              onClick={() => window.print()}
              className="shrink-0 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
            >
              列印
            </button>
          </div>
          <p className="mt-2 text-sm text-neutral-500">
            共 {selectedBooks.length} 張標籤
          </p>
        </div>

        <div className="print-area">
          {!slug && (
            <p className="no-print mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              尚未取得單位公開 slug，QR 連結將缺少單位資訊。請重新整理。
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {selectedBooks.map((b) => (
              <LabelCard
                key={b.book_id}
                bookId={b.book_id}
                title={b.title}
                slug={slug ?? ""}
              />
            ))}
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell mobileMode="topbar" topbarTitle="標籤列印" scrollLifted>
      <header className="hidden md:block mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
            標籤列印
          </h1>
          <button
            type="button"
            onClick={() => setShowLabels(true)}
            disabled={selected.size === 0}
            className="shrink-0 inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-3 rounded-xl transition disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
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
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span className="leading-none">
              批次列印{selected.size > 0 ? ` (${selected.size})` : ""}
            </span>
          </button>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          選擇要產生 QR / 條碼標籤的書本
        </p>
      </header>

      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder="搜尋書名或編號"
        wrapperClassName="mb-3"
        className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
      />
      <div className="flex justify-end gap-2 mb-5">
        <button
          type="button"
          onClick={() => selectAll(filtered)}
          className="bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          全選
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          清空
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">
          {books.length === 0 ? "尚無書籍" : "沒有符合的書"}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {filtered.map((b) => {
            const checked = selected.has(b.book_id);
            return (
              <li key={b.book_id}>
                <label className="py-3.5 flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(b.book_id)}
                    className="w-4 h-4 accent-neutral-900"
                  />
                  {b.image_url ? (
                    <ZoomableImage
                      src={b.image_url}
                      alt={b.title}
                      className="w-10 h-14 object-cover rounded border border-neutral-200"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-neutral-100 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {b.title}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                      {b.book_id}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* 手機版底部留白，避免列表被浮動按鈕遮擋 */}
      <div className="md:hidden h-24" aria-hidden />

      {/* 手機版底部固定「批次列印」按鈕（呼應分類管理頁的浮動 CTA） */}
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-40 px-5 pt-6 flex justify-center pointer-events-none bg-gradient-to-t from-white via-white/95 to-white/0"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <button
          type="button"
          onClick={() => setShowLabels(true)}
          disabled={selected.size === 0}
          className="pointer-events-auto inline-flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-white text-base font-medium px-7 py-4 rounded-full shadow-lg shadow-neutral-900/20 transition disabled:bg-neutral-300 disabled:shadow-none"
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
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          <span className="leading-none">
            批次列印{selected.size > 0 ? ` (${selected.size})` : ""}
          </span>
        </button>
      </div>
    </AdminShell>
  );
}
