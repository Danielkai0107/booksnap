"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import BookPreviewSheet, {
  type BookPreview,
} from "@/components/BookPreviewSheet";
import CloseButton from "@/components/CloseButton";
import SwipeableTabs from "@/components/SwipeableTabs";
import { useToast } from "@/components/ToastProvider";
import { BorrowRecordRow, MemberRow } from "@/lib/supabase";

type Tab = "holding" | "borrow" | "return";

type Holding = {
  book_id: string;
  title: string;
  image_url: string | null;
};

type BookMap = Record<string, BookPreview>;

export default function MemberDetailPage() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name);

  const [member, setMember] = useState<MemberRow | null>(null);
  const [holding, setHolding] = useState<Holding[]>([]);
  const [records, setRecords] = useState<BorrowRecordRow[]>([]);
  const [books, setBooks] = useState<BookMap>({});
  const [previewBookId, setPreviewBookId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("holding");
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/members/${encodeURIComponent(name)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setMember(data.member as MemberRow);
        const holdingData = (data.holding ?? []) as Holding[];
        setHolding(holdingData);
        setRecords((data.records ?? []) as BorrowRecordRow[]);
        // 把目前持有合進 books map，這樣即使該書沒有借閱紀錄也能展開預覽。
        const bookMap = { ...((data.books ?? {}) as BookMap) };
        for (const h of holdingData) {
          if (!bookMap[h.book_id]) {
            bookMap[h.book_id] = {
              book_id: h.book_id,
              title: h.title,
              image_url: h.image_url,
              status: "borrowed",
              shelf_id: null,
              current_holder: name,
              admin_name: null,
              checkin_time: null,
              category_name: null,
            };
          }
        }
        setBooks(bookMap);
      } catch (err) {
        if (!alive) return;
        console.error("[members/:name] fetch failed", err);
        toast.error("載入成員資料失敗");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [name, toast]);

  const previewBook = previewBookId ? (books[previewBookId] ?? null) : null;

  const returnedRecords = useMemo(
    () => records.filter((r) => r.returned_at),
    [records],
  );

  const lastAction = records[0] ?? null;

  return (
    <main className="min-h-screen bg-white">
      <CloseButton href="/members" icon="arrow-left" ariaLabel="回成員列表" />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-20 pb-12">
        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
          </div>
        ) : member ? (
          <>
            <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-5 md:p-7 mb-8">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
                  {member.name}
                </h1>
                <p className="mt-1 text-xs text-neutral-500">
                  加入時間 ·{" "}
                  {new Date(member.created_at).toLocaleString("zh-TW")}
                </p>
                {lastAction && (
                  <p className="mt-2 text-xs text-neutral-500">
                    最近動作 ·{" "}
                    {lastAction.returned_at
                      ? `${new Date(lastAction.returned_at).toLocaleString("zh-TW")} 歸還`
                      : `${new Date(lastAction.borrowed_at).toLocaleString("zh-TW")} 借出`}
                  </p>
                )}
              </div>
            </section>

            <SwipeableTabs
              active={tab}
              onChange={(id) => setTab(id as Tab)}
              tabs={[
                {
                  id: "holding",
                  label: `目前持有 (${holding.length})`,
                  content: (
                    <HoldingList
                      items={holding}
                      onPick={(bookId) => setPreviewBookId(bookId)}
                    />
                  ),
                },
                {
                  id: "borrow",
                  label: `借書紀錄 (${records.length})`,
                  content: (
                    <RecordList
                      records={records}
                      books={books}
                      empty="尚無借書紀錄"
                      timeKey="borrowed_at"
                      timeLabel="借出時間"
                      onPick={(bookId) => setPreviewBookId(bookId)}
                    />
                  ),
                },
                {
                  id: "return",
                  label: `還書紀錄 (${returnedRecords.length})`,
                  content: (
                    <RecordList
                      records={returnedRecords}
                      books={books}
                      empty="尚無還書紀錄"
                      timeKey="returned_at"
                      timeLabel="歸還時間"
                      onPick={(bookId) => setPreviewBookId(bookId)}
                    />
                  ),
                },
              ]}
            />

            <BookPreviewSheet
              open={!!previewBookId && !!previewBook}
              onClose={() => setPreviewBookId(null)}
              book={previewBook}
              detailHref={
                previewBookId
                  ? `/books/${encodeURIComponent(previewBookId)}`
                  : undefined
              }
            />
          </>
        ) : (
          <div className="py-20 text-center text-sm text-neutral-500">
            找不到此成員，或載入失敗
          </div>
        )}
      </div>
    </main>
  );
}

function HoldingList({
  items,
  onPick,
}: {
  items: Holding[];
  onPick: (bookId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">
        目前沒有持有任何書本
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((b) => (
        <li key={b.book_id} className="bg-neutral-100 rounded-xl">
          <button
            type="button"
            onClick={() => onPick(b.book_id)}
            className="w-full flex gap-3 items-center p-3 text-left hover:bg-neutral-200 transition rounded-xl"
          >
            {b.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.image_url}
                alt={b.title}
                className="w-12 h-16 object-cover rounded-md border border-neutral-200 shrink-0"
              />
            ) : (
              <div className="w-12 h-16 bg-white rounded-md border border-neutral-200 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {b.title}
              </p>
              <p className="text-xs text-neutral-400 mt-1 font-mono truncate">
                {b.book_id}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecordList({
  records,
  books,
  empty,
  timeKey,
  timeLabel,
  onPick,
}: {
  records: BorrowRecordRow[];
  books: BookMap;
  empty: string;
  timeKey: "borrowed_at" | "returned_at";
  timeLabel: string;
  onPick: (bookId: string) => void;
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
        const title = books[r.book_id]?.title ?? r.book_id;
        return (
          <li
            key={r.id}
            className="px-4 py-3 flex items-start justify-between gap-3 bg-neutral-100 rounded-xl"
          >
            <button
              type="button"
              onClick={() => onPick(r.book_id)}
              className="flex-1 min-w-0 text-left text-sm font-medium text-neutral-900 hover:underline line-clamp-2 leading-snug"
            >
              {title}
            </button>
            <div className="text-xs text-neutral-500 tabular-nums mt-1 text-right shrink-0">
              <p className="text-neutral-400">{timeLabel}</p>
              <p className="mt-0.5">
                {t ? new Date(t).toLocaleString("zh-TW") : "—"}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
