"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import SearchInput from "@/components/SearchInput";
import { useToast } from "@/components/ToastProvider";

type Borrower = {
  id: string;
  phone: string;
  display_name: string;
  email: string | null;
  last_active_at: string | null;
  created_at: string;
  holding_count: number;
};

/**
 * Borrowers list. Built from rows automatically created when readers borrow
 * a book through the public `/o/{slug}/borrow` flow — there is no manual
 * "add borrower" action here. Search matches both display name and phone
 * digits so admins can look someone up either way.
 */
export default function BorrowersPage() {
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/borrowers", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBorrowers((data.borrowers ?? []) as Borrower[]);
    } catch (err) {
      console.error("[admin/borrowers] fetch failed", err);
      toast.error("載入出借人清單失敗");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return borrowers;
    return borrowers.filter((b) => {
      if (b.display_name.toLowerCase().includes(q)) return true;
      if (b.phone.replace(/\D+/g, "").includes(q.replace(/\D+/g, ""))) {
        return true;
      }
      if ((b.email ?? "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [borrowers, query]);

  return (
    <AdminShell topbarTitle="出借人">
      <div className="mb-5">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="搜尋姓名、手機或 Email"
          className="w-full h-[42px] px-4 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center text-sm text-neutral-500">
          {borrowers.length === 0 ? "尚未有任何出借人。" : "沒有符合的出借人"}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {filtered.map((b) => (
            <li key={b.id} className="py-4">
              <Link
                href={`/borrowers/${encodeURIComponent(b.id)}`}
                className="press-feedback flex items-stretch gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-900 truncate">
                    {b.display_name}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                    {b.phone}
                  </p>
                  {b.email && (
                    <p className="text-xs text-neutral-400 mt-2 truncate">
                      {b.email}
                    </p>
                  )}
                </div>
                <div className="self-stretch flex flex-col items-end justify-between shrink-0">
                  {b.holding_count > 0 ? (
                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                      持有 {b.holding_count} 本
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-500 border border-neutral-200">
                      無持有
                    </span>
                  )}
                  {b.last_active_at && (
                    <p className="text-[11px] text-neutral-400 tabular-nums">
                      {new Date(b.last_active_at).toLocaleDateString("zh-TW")}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
