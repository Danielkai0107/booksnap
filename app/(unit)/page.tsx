"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthStatusToast from "@/components/AuthStatusToast";
import { supabase, BookRow, type CategoryRow } from "@/lib/supabase";
import AdminShell from "@/components/AdminShell";
import BookActionsMenu from "@/components/BookActionsMenu";
import BottomSheet from "@/components/BottomSheet";
import CategorySelect from "@/components/CategorySelect";
import CategoryTag from "@/components/CategoryTag";
import EditBookSheet from "@/components/EditBookSheet";
import ManualCheckinSheet from "@/components/ManualCheckinSheet";
import SearchInput from "@/components/SearchInput";
import { useToast } from "@/components/ToastProvider";
import { useAdminOrgInfo } from "@/lib/admin-org-info";

type EditTarget = BookRow | null;

const DESKTOP_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type DesktopPageSize = (typeof DESKTOP_PAGE_SIZE_OPTIONS)[number];
const DEFAULT_DESKTOP_PAGE_SIZE: DesktopPageSize = 25;
// 手機端用「分批載入」而非分頁，避免使用者切換頁碼時失去滾動位置。
const MOBILE_INITIAL_COUNT = 20;
const MOBILE_LOAD_STEP = 20;

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
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditTarget>(null);
  // 桌機分頁狀態。pageSize 影響 totalPages，需與 currentPage 一起 clamp，
  // 否則篩選後資料變少時 currentPage 會落在空白頁。
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<DesktopPageSize>(
    DEFAULT_DESKTOP_PAGE_SIZE,
  );
  const [mobileVisibleCount, setMobileVisibleCount] = useState(
    MOBILE_INITIAL_COUNT,
  );
  // 桌機沒有相機，按「新書入庫」走手動表單彈窗。手機 FAB 仍走 /checkin 拍照。
  const [manualCheckinOpen, setManualCheckinOpen] = useState(false);
  const toast = useToast();
  // 體驗過期 / 未付費時，「新書入庫」一律導去 /billing 讓使用者看到完整
  // 升級情境（體驗狀態、金流主開關等），不用半路再彈窗。
  const { locked } = useAdminOrgInfo();

  const handleDesktopCheckin = () => {
    if (locked) {
      router.push("/billing");
      return;
    }
    setManualCheckinOpen(true);
  };

  const handleMobileCheckin = (e: React.MouseEvent) => {
    if (locked) {
      e.preventDefault();
      router.push("/billing");
    }
  };

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
    const [booksRes, borrowersRes, catRes] = await Promise.all([
      supabase
        .from("books")
        .select("*")
        .order("checkin_time", { ascending: false }),
      supabase.from("borrowers").select("*", { count: "exact", head: true }),
      fetch("/api/categories", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ categories: [] })),
    ]);
    if (booksRes.error) {
      console.error("[admin] fetch books failed", booksRes.error);
      toast.error("載入書籍清單失敗");
    } else {
      setBooks((booksRes.data ?? []) as BookRow[]);
    }
    setMemberCount(borrowersRes.count ?? 0);
    setCategories((catRes?.categories ?? []) as CategoryRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void fetchAll();

    const onSessionChange = () => {
      void fetchAll();
    };
    window.addEventListener("booksnap:session-changed", onSessionChange);
    return () => {
      window.removeEventListener("booksnap:session-changed", onSessionChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("pendingToast");
    if (!stored) return;
    sessionStorage.removeItem("pendingToast");
    try {
      const parsed = JSON.parse(stored) as {
        message?: string;
        kind?: "success" | "error" | "info";
      };
      if (parsed.message) {
        toast.show(parsed.message, parsed.kind ?? "success");
      }
    } catch {
      // ignore malformed payload
    }
  }, [toast]);

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

  // 篩選條件變動時，桌機回到第一頁、手機重置已載入數，避免使用者卡在空白頁。
  useEffect(() => {
    setCurrentPage(1);
    setMobileVisibleCount(MOBILE_INITIAL_COUNT);
  }, [query, categoryFilter, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // currentPage 可能因外部資料減少而超出範圍（例如刪書），這裡 clamp 一次。
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

  const availableCount = books.filter((b) => b.status === "available").length;
  const borrowedCount = books.length - availableCount;

  // 匯出 URL：把目前的搜尋／分類／狀態帶進 query string，讓下載的內容
  // 與螢幕上的篩選結果一致（WYSIWYG）。後端 /api/export 會做同樣的
  // 篩選；沒有任何篩選時就是匯出整館。
  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    const trimmed = query.trim();
    if (trimmed) params.set("q", trimmed);
    if (categoryFilter) params.set("category", categoryFilter);
    if (statusFilter) params.set("status", statusFilter);
    const qs = params.toString();
    return qs ? `/api/export?${qs}` : "/api/export";
  }, [query, categoryFilter, statusFilter]);

  return (
    <>
      <AuthStatusToast homePath="/" />
      <AdminShell
        topbarTitle="書籍管理"
        topbarRight={
          <button
            type="button"
            onClick={handleDesktopCheckin}
            className="press-feedback hidden md:inline-flex items-center gap-1 text-sm font-medium text-white bg-brand hover:bg-brand-hover px-3 h-9 rounded-full"
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="leading-none">新書入庫</span>
          </button>
        }
      >
        <dl className="mb-6 grid grid-cols-4 divide-x divide-neutral-200 border border-neutral-200 rounded-xl p-3 bg-neutral-100">
          <Stat label="總書籍" value={books.length} />
          <Stat label="可借" value={availableCount} />
          <Stat label="已借出" value={borrowedCount} />
          <Stat label="出借人" value={memberCount} />
        </dl>

        <div className="mb-5 flex gap-2">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="搜尋書名或編號"
            wrapperClassName="flex-1 min-w-0"
            className="w-full h-[42px] px-4 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
          />
          <div className="flex shrink-0 items-stretch gap-2">
            <div className="w-[7.5rem] sm:w-32">
              <CategorySelect
                sizeVariant="sm"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                options={categoryOptions}
                placeholder="全部"
              />
            </div>
            <a
              href={exportHref}
              className="press-feedback inline-flex items-center justify-center shrink-0 text-sm font-medium text-neutral-800 hover:text-neutral-900 px-3 h-[42px] rounded-lg bg-white border border-neutral-200 hover:border-neutral-400"
            >
              匯出
            </a>
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
            可借
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
              {mobilePaged.map((b) => (
                <li key={b.id} className="py-4 flex gap-3 items-start">
                  <Link
                    href={`/books/${encodeURIComponent(b.book_id)}`}
                    className="press-feedback flex-1 flex gap-3 items-start min-w-0"
                  >
                    {b.image_url ? (
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
                      <p className="text-xs text-neutral-400 mt-1 font-mono truncate">
                        {b.book_id}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="text-xs text-neutral-500 truncate min-w-0">
                          {b.current_holder ?? ""}
                        </span>
                      </div>
                      <div className="flex w-full justify-between items-center gap-2 mt-2">
                        {b.category_id && (
                          <div className="">
                            <CategoryTag
                              name={categoryNameById.get(b.category_id)}
                            />
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0">
                            <StatusPill status={b.status} />
                          </span>
                        </div>
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

            {/* 手機分批載入：滾動到底時手動觸發，避免一次渲染上千張卡片。 */}
            <div className="md:hidden mt-4 flex flex-col items-center gap-2">
              <p className="text-xs text-neutral-500 tabular-nums">
                已顯示 {mobileVisible} / {filtered.length} 本
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

            {/* 桌機表格 */}
            <div className="hidden md:block overflow-x-auto border border-neutral-100 rounded-xl">
              {/* `table-fixed` + 明確欄寬：書名、持有人才會真的 truncate；
                沒這層 auto-layout 會讓長內容把整個 table 撐爛。
                `min-w-[820px]` 在 md 起點（1200px）扣掉側欄 240 + padding 後
                約剩 920px 仍夠塞，且更窄視窗會優雅地觸發水平捲動。 */}
              <table className="w-full min-w-[820px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "112px" }} />
                  <col />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "52px" }} />
                </colgroup>
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
                    <th className="text-left px-5 py-3 font-medium">持有人</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {desktopPaged.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() =>
                        router.push(`/books/${encodeURIComponent(b.book_id)}`)
                      }
                      className="hover:bg-neutral-50/60 transition cursor-pointer"
                    >
                      <td className="px-5 py-3.5 font-mono text-xs text-neutral-500 truncate">
                        {b.book_id}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          {b.image_url ? (
                            <img
                              src={b.image_url}
                              alt={b.title}
                              className="w-9 h-12 object-cover rounded border border-neutral-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-12 bg-neutral-100 rounded shrink-0" />
                          )}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="block text-neutral-900 truncate">
                              {b.title}
                            </span>
                            {b.category_id && (
                              <span className="mt-1.5 max-w-full">
                                <CategoryTag
                                  name={categoryNameById.get(b.category_id)}
                                />
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-neutral-700 truncate">
                        {b.admin_name}
                      </td>
                      <td className="px-5 py-3.5 text-neutral-500 tabular-nums whitespace-nowrap">
                        {/* 兩行：日期上、時間下。原本連著一行 `2026/05/17 上午12:05`
                          會超出 140px 欄寬擠到狀態欄；切兩行後最寬只到日期
                          (`2026/05/17`)，乾淨地落在欄寬內。 */}
                        <div>
                          {new Date(b.checkin_time).toLocaleDateString(
                            "zh-TW",
                            {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            },
                          )}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {new Date(b.checkin_time).toLocaleTimeString(
                            "zh-TW",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            },
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusPill status={b.status} />
                      </td>
                      <td className="px-5 py-3.5 text-neutral-700 truncate">
                        {b.current_holder ?? "—"}
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex"
                        >
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

            {/* 桌機分頁器：每頁筆數切換 + 上/下頁 + 頁碼。
              `tabular-nums` 讓頁碼按鈕在頁數變化時不會位移。 */}
            <div className="hidden md:flex mt-4 items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <span>
                  顯示 {filtered.length === 0 ? 0 : desktopPageStart + 1}–
                  {desktopPageEnd}，共 {filtered.length} 本
                </span>
                <span className="text-neutral-300">·</span>
                <label className="flex items-center gap-1.5">
                  <span>每頁</span>
                  <select
                    value={pageSize}
                    onChange={(e) =>
                      setPageSize(
                        Number(e.target.value) as DesktopPageSize,
                      )
                    }
                    className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-700 focus:outline-none focus:border-neutral-900"
                  >
                    {DESKTOP_PAGE_SIZE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <span>筆</span>
                </label>
              </div>

              <Pagination
                page={safePage}
                totalPages={totalPages}
                onChange={setCurrentPage}
              />
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
            onClick={handleMobileCheckin}
            className="press-feedback pointer-events-auto inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover active:bg-brand-active text-white text-base font-medium px-7 py-4 rounded-full shadow-lg shadow-brand/25"
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

        <ManualCheckinSheet
          open={manualCheckinOpen}
          onClose={() => setManualCheckinOpen(false)}
          categories={categories}
          onCreated={() => {
            void fetchAll();
          }}
        />

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
                      console.error("[admin] delete book failed", err);
                      toast.error("刪除失敗，請稍後再試");
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
    </>
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
  // `whitespace-nowrap` 是關鍵：沒有它，table cell 寬度不足時中文字會逐字
  // 換行，再加上 h-[26px] 固定高 → pill 被內容撐爆變成直立膠囊。
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
      className={`inline-flex items-center gap-1.5 h-[38px] text-xs font-medium px-3 rounded-full border transition ${
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

// 產生像 [1, '…', 4, 5, 6, '…', 12] 的頁碼序列。
// `siblings` 控制目前頁兩側顯示幾個頁碼；首尾固定顯示，避免頁數很多時
// 整列頁碼把分頁器撐爆。
function buildPageRange(
  page: number,
  totalPages: number,
  siblings = 1,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const first = 1;
  const last = totalPages;
  const left = Math.max(page - siblings, first + 1);
  const right = Math.min(page + siblings, last - 1);

  const items: Array<number | "ellipsis"> = [first];
  if (left > first + 1) items.push("ellipsis");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < last - 1) items.push("ellipsis");
  items.push(last);
  return items;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  if (totalPages <= 1) {
    return <div className="h-9" aria-hidden />;
  }
  const items = buildPageRange(page, totalPages);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav className="flex items-center gap-1" aria-label="分頁">
      <PaginationButton
        onClick={() => onChange(page - 1)}
        disabled={prevDisabled}
        ariaLabel="上一頁"
      >
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
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </PaginationButton>

      {items.map((item, idx) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${idx}`}
            className="inline-flex h-9 min-w-9 items-center justify-center text-sm text-neutral-400"
          >
            …
          </span>
        ) : (
          <PaginationButton
            key={item}
            onClick={() => onChange(item)}
            active={item === page}
            ariaLabel={`第 ${item} 頁`}
          >
            <span className="tabular-nums">{item}</span>
          </PaginationButton>
        ),
      )}

      <PaginationButton
        onClick={() => onChange(page + 1)}
        disabled={nextDisabled}
        ariaLabel="下一頁"
      >
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
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </PaginationButton>
    </nav>
  );
}

function PaginationButton({
  children,
  onClick,
  disabled,
  active,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 min-w-9 items-center justify-center px-2.5 text-sm font-medium rounded-md border transition ${
        active
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200`}
    >
      {children}
    </button>
  );
}
