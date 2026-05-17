"use client";

import { useCallback, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import SwipeableTabs from "@/components/SwipeableTabs";
import { useToast } from "@/components/ToastProvider";

type Phase = "lookup" | "result";

type Tab = "holding" | "borrow" | "return";

type Holding = {
  book_id: string;
  title: string;
  image_url: string | null;
  current_location: string | null;
  category_name: string | null;
};

type BorrowRecord = {
  id: string;
  book_id: string;
  borrowed_at: string;
  returned_at: string | null;
  location_note: string | null;
};

type BookInfo = {
  book_id: string;
  title: string;
  image_url: string | null;
  category_name: string | null;
};

type HistoryResponse = {
  borrower: {
    id: string;
    display_name: string;
    last_active_at: string | null;
    created_at: string;
  } | null;
  holding: Holding[];
  records: BorrowRecord[];
  books: Record<string, BookInfo>;
};

type Props = {
  slug: string;
  /** 用於彈窗 subtitle 顯示組織名 */
  orgName: string;
  /**
   * 落地頁的「書籍查詢」按鈕是否啟用，用來決定本元件是否獨佔一整列。
   * `false` 時 width 拉滿；`true` 時與書籍查詢平分兩欄。
   */
  catalogEnabled: boolean;
};

/**
 * 「我的紀錄」入口：點擊後彈出 bottom sheet，使用者輸入手機號碼查詢自己的
 *  - 目前持有
 *  - 借紀錄
 *  - 歸還紀錄
 *
 * 三個分頁，使用 `SwipeableTabs` 支援左右滑動。
 *
 * 隱私性：API 端只回該手機在本 org 的資料，且不回 email / 完整手機；
 * 因為使用者本身才知道自己的手機，所以可以接受匿名查詢。
 */
export default function MyRecordsButton({
  slug,
  orgName,
  catalogEnabled,
}: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("lookup");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [tab, setTab] = useState<Tab>("holding");

  const reset = useCallback(() => {
    setPhase("lookup");
    setPhone("");
    setData(null);
    setTab("holding");
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    // 等彈窗收闔動畫結束再清狀態，避免用戶看到內容閃一下回 lookup。
    setTimeout(reset, 220);
  }, [reset]);

  async function handleQuery() {
    const trimmed = phone.trim();
    if (trimmed.replace(/\D+/g, "").length < 8) {
      toast.error("請輸入有效的手機號碼");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/public/borrowers/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, phone: trimmed }),
      });
      const json = (await res.json()) as HistoryResponse | { error?: string };
      if (!res.ok) {
        throw new Error(
          ("error" in json && json.error) || `HTTP ${res.status}`,
        );
      }
      setData(json as HistoryResponse);
      setTab("holding");
      setPhase("result");
    } catch (err) {
      console.error("[my-records] query failed", err);
      toast.error(err instanceof Error ? err.message : "查詢失敗");
    } finally {
      setLoading(false);
    }
  }

  const returnedRecords = data ? data.records.filter((r) => r.returned_at) : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`press-feedback inline-flex ${catalogEnabled ? "" : "w-full"} items-center justify-center gap-2 px-4 py-4 rounded-2xl text-sm font-medium transition bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
        <span className="leading-none">我的紀錄</span>
      </button>

      <BottomSheet
        open={open}
        onClose={handleClose}
        title={phase === "lookup" ? "我的紀錄" : "我的紀錄"}
        subtitle={
          phase === "lookup"
            ? `${orgName} · 輸入手機號碼查詢`
            : data?.borrower
              ? `${orgName} · ${data.borrower.display_name}`
              : `${orgName} · 查無紀錄`
        }
        maxHeight="92vh"
        minContentHeight={phase === "lookup" ? "0" : "62vh"}
        footer={
          phase === "lookup" ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="press-feedback flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3.5 rounded-xl transition"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={handleQuery}
                disabled={loading}
                className="press-feedback flex-1 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-sm font-medium py-3.5 rounded-xl transition"
              >
                {loading ? "查詢中…" : "查詢"}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="press-feedback flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3.5 rounded-xl transition"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase("lookup");
                  setData(null);
                }}
                className="press-feedback flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-xl transition"
              >
                重新查詢
              </button>
            </div>
          )
        }
      >
        {phase === "lookup" ? (
          <div className="space-y-4 pb-2">
            <label className="block">
              <span className="text-xs text-neutral-500">手機號碼</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0912345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) {
                    void handleQuery();
                  }
                }}
                className="mt-1 w-full px-4 py-3 border border-neutral-200 rounded-xl text-base focus:outline-none focus:border-neutral-900"
              />
              <span className="mt-1.5 block text-[11px] text-neutral-400">
                輸入借書時使用的手機號碼，即可看到自己借過 / 還過哪些書。
              </span>
            </label>
          </div>
        ) : data && data.borrower ? (
          <div className="-mx-2">
            <SwipeableTabs
              active={tab}
              onChange={(t) => setTab(t as Tab)}
              minHeight="46vh"
              tabs={[
                {
                  id: "holding",
                  label: `目前持有 (${data.holding.length})`,
                  content: (
                    <div className="px-2 pb-2">
                      <HoldingList holding={data.holding} />
                    </div>
                  ),
                },
                {
                  id: "borrow",
                  label: `借紀錄 (${data.records.length})`,
                  content: (
                    <div className="px-2 pb-2">
                      <RecordList
                        records={data.records}
                        timeKey="borrowed_at"
                        timeLabel="借出"
                        books={data.books}
                        empty="尚無借閱紀錄"
                      />
                    </div>
                  ),
                },
                {
                  id: "return",
                  label: `歸還紀錄 (${returnedRecords.length})`,
                  content: (
                    <div className="px-2 pb-2">
                      <RecordList
                        records={returnedRecords}
                        timeKey="returned_at"
                        timeLabel="歸還"
                        books={data.books}
                        empty="尚無歸還紀錄"
                      />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm text-neutral-700 font-bold">很抱歉，本單位查無紀錄</p>
            <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
              請確認號碼正確，或先到「出借」掃書建立紀錄。
            </p>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

function HoldingList({ holding }: { holding: Holding[] }) {
  if (holding.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">
        目前沒有借閱中的書
      </p>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
      {holding.map((b) => (
        <li key={b.book_id} className="py-3 flex items-start gap-3">
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
            <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
              {b.book_id}
            </p>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {b.category_name && (
                <span className="text-[11px] text-neutral-600 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-full">
                  {b.category_name}
                </span>
              )}
              {b.current_location && (
                <span className="text-[11px] text-neutral-500">
                  @ {b.current_location}
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecordList({
  records,
  timeKey,
  timeLabel,
  books,
  empty,
}: {
  records: BorrowRecord[];
  timeKey: "borrowed_at" | "returned_at";
  timeLabel: string;
  books: Record<string, BookInfo>;
  empty: string;
}) {
  if (records.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">{empty}</p>
    );
  }
  return (
    <ul className="space-y-2">
      {records.map((r) => {
        const t = r[timeKey];
        const book = books[r.book_id];
        return (
          <li
            key={r.id}
            className="px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl"
          >
            <div className="flex items-start gap-3">
              {book?.image_url ? (
                <img
                  src={book.image_url}
                  alt={book.title}
                  className="w-10 h-14 object-cover rounded border border-neutral-200 shrink-0"
                />
              ) : (
                <div className="w-10 h-14 bg-neutral-100 rounded shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {book?.title ?? r.book_id}
                </p>
                <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                  {r.book_id}
                </p>
                <p className="text-[11px] text-neutral-500 tabular-nums mt-1">
                  <span className="text-neutral-400">{timeLabel} </span>
                  {t ? new Date(t).toLocaleString("zh-TW") : "—"}
                  {r.location_note && (
                    <span className="ml-1 text-neutral-500">
                      · {r.location_note}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
