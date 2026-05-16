"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import BookPreviewSheet, {
  type BookPreview,
} from "@/components/BookPreviewSheet";
import CloseButton from "@/components/CloseButton";
import SwipeableTabs from "@/components/SwipeableTabs";
import ZoomableImage from "@/components/ZoomableImage";
import { BorrowRecordRow, MemberRow } from "@/lib/supabase";

type Tab = "borrow" | "return";

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
  const [tab, setTab] = useState<Tab>("borrow");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        setHolding((data.holding ?? []) as Holding[]);
        setRecords((data.records ?? []) as BorrowRecordRow[]);
        setBooks((data.books ?? {}) as BookMap);
      } catch (err) {
        if (!alive) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [name]);

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
        ) : errorMsg ? (
          <div className="px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
            {errorMsg}
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

              <div className="mt-5">
                <p className="text-[18px] font-bold text-neutral-900 mb-4">
                  目前持有 {holding.length} 本
                </p>
                {holding.length === 0 ? (
                  <p className="text-sm text-neutral-400">無持有書本</p>
                ) : (
                  <ul className="flex gap-3 overflow-x-auto pb-1">
                    {holding.map((b) => (
                      <li key={b.book_id} className="shrink-0 w-20">
                        {b.image_url ? (
                          <ZoomableImage
                            src={b.image_url}
                            alt={b.title}
                            className="w-20 h-20 object-cover rounded-md border border-neutral-200"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-white rounded-md border border-neutral-200" />
                        )}
                        <p className="mt-1.5 text-xs text-neutral-700 truncate text-center">
                          {b.title}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <SwipeableTabs
              active={tab}
              onChange={(id) => setTab(id as Tab)}
              tabs={[
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
        ) : null}
      </div>
    </main>
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
            <div className="text-xs text-neutral-500 tabular-nums text-right shrink-0">
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
