"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BookPreviewSheet, {
  type BookPreview,
} from "@/components/BookPreviewSheet";
import SearchInput from "@/components/SearchInput";
import { useToast } from "@/components/ToastProvider";

type PublicBook = {
  book_id: string;
  title: string;
  image_url: string | null;
  status: string;
  shelf_id: string | null;
  current_holder: string | null;
  current_location: string | null;
  current_holder_phone_masked: string | null;
  category_name: string | null;
};

type StatusFilter = "all" | "available" | "borrowed";

type Props = {
  slug: string;
  orgName: string;
};

/**
 * Catalog explorer for the public side. Filters are local because the
 * server-side endpoint already caps responses at 200 rows — well within what
 * a phone can sort through with `.filter()` in memory.
 */
export default function CatalogClient({ slug, orgName }: Props) {
  const [books, setBooks] = useState<PublicBook[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [previewBookId, setPreviewBookId] = useState<string | null>(null);
  const toast = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/public/books?slug=${encodeURIComponent(slug)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBooks((data.books ?? []) as PublicBook[]);
      // The server returns the org's full category list (sorted by sort_order),
      // not just the categories that happen to be in `books`. This means the
      // dropdown matches what admins see in `分類管理` even when a category has
      // no books tagged yet.
      const apiCategories = (data.categories ?? []) as Array<{
        id: string;
        name: string;
      }>;
      setCategories(apiCategories.map((c) => c.name));
    } catch (err) {
      console.error("[public/books] fetch failed", err);
      toast.error(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [slug, toast]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (categoryFilter !== "all" && b.category_name !== categoryFilter)
        return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) || b.book_id.toLowerCase().includes(q)
      );
    });
  }, [books, query, statusFilter, categoryFilter]);

  const booksById = useMemo(() => {
    const map: Record<string, PublicBook> = {};
    for (const b of books) map[b.book_id] = b;
    return map;
  }, [books]);

  const previewBook: BookPreview | null = previewBookId
    ? toBookPreview(booksById[previewBookId])
    : null;

  return (
    <div className="pt-6 pb-12">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          {orgName} · 查詢
        </h1>
      </header>

      <div className="mb-3 flex items-stretch gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="搜尋書名 / 編號"
          wrapperClassName="flex-1 min-w-0"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
        <div className="relative w-1/3 shrink-0">
          <select
            aria-label="篩選分類"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full h-full appearance-none truncate px-3 pr-8 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900 transition"
          >
            <option value="all">全部分類</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4 mb-4 text-xs">
        <FilterChip
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
          label="全部"
        />
        <FilterChip
          active={statusFilter === "available"}
          onClick={() => setStatusFilter("available")}
          label="可借"
          dotColor="bg-emerald-500"
        />
        <FilterChip
          active={statusFilter === "borrowed"}
          onClick={() => setStatusFilter("borrowed")}
          label="借出中"
          dotColor="bg-neutral-400"
        />
        <span className="ml-auto text-neutral-500">
          共 {filtered.length} 本
        </span>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-neutral-500">
          {books.length === 0 ? "尚未有館藏" : "沒有符合的書"}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {filtered.map((b) => (
            <li key={b.book_id} className="py-3">
              <button
                type="button"
                onClick={() => setPreviewBookId(b.book_id)}
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
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {b.title}
                  </p>
                  <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                    {b.book_id}
                    {b.shelf_id ? ` · 書架 ${b.shelf_id}` : ""}
                  </p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <StatusPill status={b.status} />
                    {b.category_name && (
                      <span className="text-[11px] text-neutral-600 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-full">
                        {b.category_name}
                      </span>
                    )}
                  </div>
                  {b.status === "borrowed" && b.current_holder && (
                    <p className="mt-2 text-xs text-neutral-600">
                      出借中：
                      <span className="text-neutral-900 font-medium">
                        {b.current_holder}
                      </span>
                      {b.current_holder_phone_masked && (
                        <span className="ml-1 text-neutral-400 font-mono">
                          ({b.current_holder_phone_masked})
                        </span>
                      )}
                      {b.current_location && (
                        <span className="ml-1 text-neutral-500">
                          @ {b.current_location}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <BookPreviewSheet
        open={previewBookId !== null}
        onClose={() => setPreviewBookId(null)}
        book={previewBook}
      />
    </div>
  );
}

function toBookPreview(b: PublicBook | undefined): BookPreview | null {
  if (!b) return null;
  return {
    book_id: b.book_id,
    title: b.title,
    image_url: b.image_url,
    status: b.status,
    shelf_id: b.shelf_id,
    current_holder: b.current_holder,
    current_location: b.current_location,
    current_holder_phone_masked: b.current_holder_phone_masked,
    admin_name: null,
    checkin_time: null,
    category_name: b.category_name,
  };
}

function FilterChip({
  active,
  onClick,
  label,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press-feedback inline-flex items-center gap-1.5 h-[38px] text-xs font-medium px-3 rounded-full border transition ${
        active
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
      }`}
    >
      {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 h-[26px] text-xs px-2.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        可借
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 h-[26px] text-xs px-2.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 font-medium whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      借出
    </span>
  );
}
