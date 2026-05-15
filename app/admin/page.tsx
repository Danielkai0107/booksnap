"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, BookRow } from "@/lib/supabase";

export default function AdminPage() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .order("checkin_time", { ascending: false });
      if (!alive) return;
      if (error) {
        setErrorMsg(error.message);
      } else {
        setBooks((data ?? []) as BookRow[]);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => b.title.toLowerCase().includes(q));
  }, [books, query]);

  const inCount = books.filter((b) => b.status === "in").length;
  const outCount = books.length - inCount;

  return (
    <main className="min-h-screen">
      <nav className="w-full border-b border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-neutral-500 hover:text-neutral-900 transition"
          >
            返回
          </Link>
          <span className="text-sm font-medium tracking-tight text-neutral-900">
            後台管理
          </span>
          <span className="w-12" />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-10">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-400 mb-3">
            Admin
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
            書籍庫存
          </h1>

          <dl className="mt-8 grid grid-cols-3 gap-4 sm:gap-8 max-w-lg">
            <Stat label="總書籍" value={books.length} />
            <Stat label="在庫" value={inCount} />
            <Stat label="已借出" value={outCount} />
          </dl>
        </header>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋書名"
            className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
          />
          <a
            href="/api/export"
            className="inline-flex items-center justify-center bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-5 py-2.5 rounded-lg transition"
          >
            下載 Excel
          </a>
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
              {books.length === 0
                ? "尚無書籍資料，請至入庫頁新增"
                : "沒有符合的書名"}
            </p>
            {books.length === 0 && (
              <Link
                href="/checkin"
                className="inline-block mt-5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
              >
                開始入庫
              </Link>
            )}
          </div>
        ) : (
          <>
            <ul className="md:hidden divide-y divide-neutral-100 border-y border-neutral-100">
              {filtered.map((b) => (
                <li key={b.id} className="py-4 flex gap-4 items-start">
                  {b.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
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
                    <p className="text-xs text-neutral-500 mt-2">
                      {b.admin_name} ·{" "}
                      {new Date(b.checkin_time).toLocaleDateString("zh-TW")}
                    </p>
                    <div className="flex items-center gap-2 mt-2.5">
                      <StatusPill status={b.status} />
                      {b.shelf_id && (
                        <span className="text-xs text-neutral-500">
                          {b.shelf_id}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden md:block overflow-x-auto border border-neutral-100 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50/60 text-neutral-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">編號</th>
                    <th className="text-left px-5 py-3 font-medium">書名</th>
                    <th className="text-left px-5 py-3 font-medium">
                      入庫人員
                    </th>
                    <th className="text-left px-5 py-3 font-medium">
                      入庫時間
                    </th>
                    <th className="text-left px-5 py-3 font-medium">狀態</th>
                    <th className="text-left px-5 py-3 font-medium">書架</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filtered.map((b) => (
                    <tr key={b.id} className="hover:bg-neutral-50/60 transition">
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
                      <td className="px-5 py-3.5 text-neutral-500">
                        {b.shelf_id || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "in") {
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
