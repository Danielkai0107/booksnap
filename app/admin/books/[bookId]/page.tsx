"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import ZoomableImage from "@/components/ZoomableImage";
import { BookRow, BorrowRecordRow } from "@/lib/supabase";

type Tab = "borrow" | "return";

export default function BookDetailPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = decodeURIComponent(params.bookId);
  const [book, setBook] = useState<BookRow | null>(null);
  const [records, setRecords] = useState<BorrowRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("borrow");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/books/${encodeURIComponent(bookId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setBook(data.book as BookRow);
        setRecords((data.records ?? []) as BorrowRecordRow[]);
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
  }, [bookId]);

  const returnedRecords = useMemo(
    () => records.filter((r) => r.returned_at),
    [records]
  );

  return (
    <AdminShell backHref="/admin" desktopBack={{ href: "/admin", label: "回書籍列表" }}>
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : errorMsg ? (
        <div className="px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
          {errorMsg}
        </div>
      ) : book ? (
        <>
          <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-5 md:p-7 mb-8">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h1 className="flex-1 min-w-0 text-xl md:text-2xl font-semibold tracking-tight text-neutral-900 leading-snug">
                {book.title}
              </h1>
              <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                <StatusPill status={book.status} />
                {book.shelf_id && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white text-neutral-700 border border-neutral-200">
                    書架 {book.shelf_id}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-5 items-stretch">
              {book.image_url ? (
                <ZoomableImage
                  src={book.image_url}
                  alt={book.title}
                  className="w-24 md:w-32 self-stretch object-cover rounded-lg border border-neutral-200 shrink-0"
                />
              ) : (
                <div className="w-24 md:w-32 self-stretch rounded-lg bg-white border border-neutral-200 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-neutral-400 font-mono">
                  {book.book_id}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  入庫 · {book.admin_name}
                </p>
                <p className="text-xs text-neutral-500 tabular-nums">
                  {new Date(book.checkin_time).toLocaleString("zh-TW")}
                </p>
                {book.current_holder && (
                  <p className="mt-3 text-sm text-neutral-600">
                    目前持有者：
                    <span className="text-neutral-900 font-medium">
                      {book.current_holder}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>

          <section>
            <div className="flex gap-1 border-b border-neutral-200 mb-5">
              <TabBtn
                active={tab === "borrow"}
                onClick={() => setTab("borrow")}
              >
                借書紀錄 ({records.length})
              </TabBtn>
              <TabBtn
                active={tab === "return"}
                onClick={() => setTab("return")}
              >
                還書紀錄 ({returnedRecords.length})
              </TabBtn>
            </div>

            {tab === "borrow" ? (
              <RecordList
                records={records}
                empty="尚無借書紀錄"
                timeKey="borrowed_at"
                timeLabel="借出時間"
              />
            ) : (
              <RecordList
                records={returnedRecords}
                empty="尚無還書紀錄"
                timeKey="returned_at"
                timeLabel="歸還時間"
              />
            )}
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        在庫
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      已借出
    </span>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
        active
          ? "text-neutral-900 border-neutral-900"
          : "text-neutral-500 hover:text-neutral-900 border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

function RecordList({
  records,
  empty,
  timeKey,
  timeLabel,
}: {
  records: BorrowRecordRow[];
  empty: string;
  timeKey: "borrowed_at" | "returned_at";
  timeLabel: string;
}) {
  if (records.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">{empty}</p>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
      {records.map((r) => {
        const t = r[timeKey];
        return (
          <li
            key={r.id}
            className="py-3.5 flex items-center justify-between gap-3"
          >
            <a
              href={`/admin/members/${encodeURIComponent(r.borrower_name)}`}
              className="text-sm font-medium text-neutral-900 hover:underline"
            >
              {r.borrower_name}
            </a>
            <div className="text-xs text-neutral-500 tabular-nums text-right">
              <span className="text-neutral-400">{timeLabel}：</span>
              {t ? new Date(t).toLocaleString("zh-TW") : "—"}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
