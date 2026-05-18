"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { ListPagerBar } from "@/components/Pagination";
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

const DESKTOP_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type DesktopPageSize = (typeof DESKTOP_PAGE_SIZE_OPTIONS)[number];
const DEFAULT_DESKTOP_PAGE_SIZE: DesktopPageSize = 25;
const MOBILE_INITIAL_COUNT = 20;
const MOBILE_LOAD_STEP = 20;

/**
 * Borrowers list. Built from rows automatically created when readers borrow
 * a book through the public `/o/{slug}/borrow` flow — there is no manual
 * "add borrower" action here. Search matches both display name and phone
 * digits so admins can look someone up either way.
 */
export default function BorrowersPage() {
  const router = useRouter();
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<DesktopPageSize>(
    DEFAULT_DESKTOP_PAGE_SIZE,
  );
  const [mobileVisibleCount, setMobileVisibleCount] = useState(
    MOBILE_INITIAL_COUNT,
  );
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

  // 搜尋條件變動時，桌機回到第一頁、手機重置已載入數，避免使用者卡在空白頁。
  useEffect(() => {
    setCurrentPage(1);
    setMobileVisibleCount(MOBILE_INITIAL_COUNT);
  }, [query, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const desktopPageStart = (safePage - 1) * pageSize;
  const desktopPageEnd = Math.min(desktopPageStart + pageSize, filtered.length);
  const desktopPaged = useMemo(
    () => filtered.slice(desktopPageStart, desktopPageEnd),
    [filtered, desktopPageStart, desktopPageEnd],
  );

  const mobileVisible = Math.min(mobileVisibleCount, filtered.length);
  const mobilePaged = useMemo(
    () => filtered.slice(0, mobileVisible),
    [filtered, mobileVisible],
  );
  const mobileHasMore = mobileVisible < filtered.length;

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
        <>
          {/* 手機卡片列表 */}
          <ul className="md:hidden divide-y divide-neutral-100 border-y border-neutral-100">
            {mobilePaged.map((b) => (
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

          {/* 手機分批載入 */}
          <div className="md:hidden mt-4 flex flex-col items-center gap-2">
            <p className="text-xs text-neutral-500 tabular-nums">
              已顯示 {mobileVisible} / {filtered.length} 人
            </p>
            {mobileHasMore && (
              <button
                type="button"
                onClick={() =>
                  setMobileVisibleCount((n) => n + MOBILE_LOAD_STEP)
                }
                className="press-feedback inline-flex items-center justify-center text-sm font-medium text-neutral-800 hover:text-neutral-900 px-4 h-10 rounded-full bg-white border border-neutral-200 hover:border-neutral-400"
              >
                載入更多
              </button>
            )}
          </div>

          {/* 桌機表格：跟書籍管理 / 標籤列印一致的表頭 + 分頁樣式 */}
          <div className="hidden md:block overflow-x-auto border border-neutral-200 rounded-2xl">
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <colgroup>
                <col />
                <col style={{ width: "150px" }} />
                <col style={{ width: "220px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "120px" }} />
              </colgroup>
              <thead className="text-neutral-400 text-xs">
                <tr className="border-b border-neutral-100">
                  <th className="text-left px-5 py-3 font-normal">姓名</th>
                  <th className="text-left px-5 py-3 font-normal">手機</th>
                  <th className="text-left px-5 py-3 font-normal">Email</th>
                  <th className="text-left px-5 py-3 font-normal">持有</th>
                  <th className="text-left px-5 py-3 font-normal">
                    最後上線
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {desktopPaged.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() =>
                      router.push(`/borrowers/${encodeURIComponent(b.id)}`)
                    }
                    className="hover:bg-neutral-50/60 transition cursor-pointer"
                  >
                    <td className="px-5 py-4 text-neutral-900 font-medium truncate">
                      {b.display_name}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-neutral-500 truncate">
                      {b.phone}
                    </td>
                    <td className="px-5 py-4 text-neutral-500 truncate">
                      {b.email ?? <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      {b.holding_count > 0 ? (
                        <span className="inline-flex items-center gap-1.5 h-[26px] text-xs text-amber-600 font-medium whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          {b.holding_count} 本
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 h-[26px] text-xs text-neutral-400 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                          無持有
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-neutral-500 tabular-nums whitespace-nowrap">
                      {b.last_active_at ? (
                        new Date(b.last_active_at).toLocaleDateString("zh-TW", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ListPagerBar
            total={filtered.length}
            pageStart={desktopPageStart}
            pageEnd={desktopPageEnd}
            pageSize={pageSize}
            pageSizeOptions={DESKTOP_PAGE_SIZE_OPTIONS}
            onPageSizeChange={(n) => setPageSize(n as DesktopPageSize)}
            page={safePage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            unit="人"
          />
        </>
      )}
    </AdminShell>
  );
}
