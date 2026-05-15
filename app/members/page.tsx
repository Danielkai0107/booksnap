"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import CloseButton from "@/components/CloseButton";
import ScrollToTopButton from "@/components/ScrollToTopButton";

type Member = {
  name: string;
  created_at: string;
  holdingCount: number;
};

export default function MembersListPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [membersRes, booksRes] = await Promise.all([
        supabase
          .from("members")
          .select("name, created_at")
          .order("created_at", { ascending: true }),
        supabase
          .from("books")
          .select("current_holder")
          .not("current_holder", "is", null),
      ]);
      if (membersRes.error) throw membersRes.error;
      if (booksRes.error) throw booksRes.error;
      const countMap = new Map<string, number>();
      (booksRes.data ?? []).forEach((row) => {
        const h = (row as { current_holder: string | null }).current_holder;
        if (h) countMap.set(h, (countMap.get(h) ?? 0) + 1);
      });
      const list = (membersRes.data ?? []).map((m) => ({
        name: m.name as string,
        created_at: m.created_at as string,
        holdingCount: countMap.get(m.name as string) ?? 0,
      }));
      setMembers(list);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, query]);

  return (
    <main className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 bg-white/85 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-3 flex items-center">
          <CloseButton href="/" inline />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋成員姓名"
            className="flex-1 min-w-0 h-[42px] px-4 ml-4 rounded-full border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
          />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-6 pb-12">
        <header className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">
            成員查詢
          </h1>
          <p className="text-sm text-neutral-500 shrink-0">
            共 {members.length} 位成員
          </p>
        </header>

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
            {members.length === 0 ? "尚無成員" : "沒有符合的成員"}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((m) => (
              <li key={m.name}>
                <Link
                  href={`/members/${encodeURIComponent(m.name)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-neutral-100 hover:bg-neutral-200/70 transition"
                >
                  <div>
                    <p className="font-medium text-neutral-900">{m.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      目前持有 {m.holdingCount} 本
                    </p>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 14 14"
                    fill="none"
                    className="text-neutral-400 shrink-0"
                    aria-hidden
                  >
                    <path
                      d="M5 2L10 7L5 12"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ScrollToTopButton />
    </main>
  );
}
