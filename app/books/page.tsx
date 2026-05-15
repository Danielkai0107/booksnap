"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, BookRow, type CategoryRow } from "@/lib/supabase";
import CategorySelect from "@/components/CategorySelect";
import CategoryTag from "@/components/CategoryTag";
import CloseButton from "@/components/CloseButton";

export default function BooksListPage() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [booksRes, catRes] = await Promise.all([
        supabase
          .from("books")
          .select("*")
          .order("checkin_time", { ascending: false }),
        fetch("/api/categories", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => ({ categories: [] })),
      ]);
      if (!alive) return;
      if (booksRes.error) setErrorMsg(booksRes.error.message);
      else setBooks((booksRes.data ?? []) as BookRow[]);
      setCategories((catRes?.categories ?? []) as CategoryRow[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (categoryFilter && b.category_id !== categoryFilter) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.book_id.toLowerCase().includes(q) ||
        (b.current_holder ?? "").toLowerCase().includes(q)
      );
    });
  }, [books, query, categoryFilter]);

  return (
    <main className="min-h-screen bg-white">
      <CloseButton href="/" />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-20 pb-12">
        <header className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">
            書籍清單
          </h1>
          <p className="text-sm text-neutral-500 shrink-0">
            共 {filtered.length} 本書
          </p>
        </header>

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋書名、編號或持有人"
            className="flex-1 min-w-0 h-[42px] px-4 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
          />
          <div className="w-1/3 shrink-0">
            <CategorySelect
              sizeVariant="sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={categoryOptions}
              placeholder="全部分類"
            />
          </div>
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
          <p className="py-16 text-center text-sm text-neutral-500">
            {books.length === 0 ? "尚無書籍" : "沒有符合的書"}
          </p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {filtered.map((b) => {
              const categoryName = b.category_id
                ? (categoryNameById.get(b.category_id) ?? null)
                : null;
              return (
                <li key={b.book_id}>
                  <Link
                    href={`/books/${encodeURIComponent(b.book_id)}`}
                    className="block bg-white border border-neutral-200 hover:border-neutral-400 rounded-xl overflow-hidden flex flex-col h-full transition"
                  >
                    <div className="aspect-square bg-neutral-100 relative">
                      {b.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.image_url}
                          alt={b.title}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">
                          無圖
                        </div>
                      )}
                      <span className="absolute top-2 left-2">
                        <StatusPill status={b.status} />
                      </span>
                      {categoryName && (
                        <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)]">
                          <CategoryTag name={categoryName} variant="solid" />
                        </span>
                      )}
                    </div>
                    <div className="p-3 flex-1 flex flex-col">
                      <p className="text-sm font-medium text-neutral-900 line-clamp-2 min-h-[2.5em]">
                        {b.title}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-400 font-mono truncate">
                        {b.book_id}
                      </p>
                      {b.status === "borrowed" && b.current_holder && (
                        <p className="mt-2 text-xs text-neutral-600 truncate">
                          持有：
                          <span className="text-neutral-900 font-medium">
                            {b.current_holder}
                          </span>
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-emerald-700 border border-emerald-100 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        可借
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-neutral-700 border border-neutral-200 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      已借出
    </span>
  );
}
