"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { formatDateYMD, generateBookId } from "@/lib/bookId";
import { supabase } from "@/lib/supabase";

type StoredBook = {
  title: string;
  imageDataUrl: string;
};

type LabelBook = StoredBook & {
  bookId: string;
  qrDataUrl: string;
};

const BOOKS_KEY = "books";
const ADMIN_KEY = "adminName";

export default function ResultPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("");
  const [books, setBooks] = useState<LabelBook[]>([]);
  const [now] = useState<Date>(() => new Date());
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const a = sessionStorage.getItem(ADMIN_KEY) ?? "";
    const raw = sessionStorage.getItem(BOOKS_KEY);
    setAdminName(a);
    if (!raw) {
      setLoading(false);
      return;
    }
    try {
      const stored: StoredBook[] = JSON.parse(raw);
      (async () => {
        // 先查當日已存在的最大序號，避免與今天先前的入庫撞號
        const ymd = formatDateYMD(now);
        const prefix = `LIB-${ymd}-`;
        let startSeq = 1;
        try {
          const { data: existing, error } = await supabase
            .from("books")
            .select("book_id")
            .like("book_id", `${prefix}%`)
            .order("book_id", { ascending: false })
            .limit(1);
          if (error) throw error;
          const lastId = existing?.[0]?.book_id as string | undefined;
          if (lastId) {
            const lastSeq = parseInt(lastId.slice(prefix.length), 10);
            if (!Number.isNaN(lastSeq)) startSeq = lastSeq + 1;
          }
        } catch (err) {
          console.warn(
            "[result] failed to fetch existing book_ids, default to 001",
            err
          );
        }

        const arr = await Promise.all(
          stored.map(async (b, idx) => {
            const bookId = generateBookId(now, startSeq + idx);
            const qrDataUrl = await QRCode.toDataURL(bookId, {
              margin: 1,
              width: 220,
              color: { dark: "#0a0a0a", light: "#ffffff" },
            });
            return { ...b, bookId, qrDataUrl } as LabelBook;
          })
        );
        setBooks(arr);
        setLoading(false);
      })();
    } catch (err) {
      console.error(err);
      setErrorMsg("讀取暫存資料失敗，請重新入庫。");
      setLoading(false);
    }
  }, [now]);

  const checkinTimeText = useMemo(
    () =>
      now.toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [now]
  );

  const handlePrint = () => {
    window.print();
  };

  const handleSubmit = async () => {
    if (books.length === 0 || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName,
          books: books.map((b) => ({
            title: b.title,
            bookId: b.bookId,
            imageBase64: b.imageDataUrl,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      sessionStorage.removeItem(BOOKS_KEY);
      sessionStorage.removeItem(ADMIN_KEY);
      router.push("/admin");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`送出失敗：${msg}`);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
      </main>
    );
  }

  if (books.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-5 text-center">
        <p className="text-neutral-500 text-sm">尚未入庫任何書籍</p>
        <Link
          href="/checkin"
          className="bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
        >
          回到入庫頁
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <nav className="w-full border-b border-black/[0.06] no-print">
        <div className="max-w-3xl mx-auto px-6 sm:px-10 h-14 flex items-center justify-between">
          <Link
            href="/checkin/scan"
            className="text-sm text-neutral-500 hover:text-neutral-900 transition"
          >
            返回掃描
          </Link>
          <span className="text-sm font-medium tracking-tight text-neutral-900">
            入庫結算
          </span>
          <span className="w-16" />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 sm:px-10 py-10">
        <header className="mb-10 no-print">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-400 mb-3">
            Step 3 of 3
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
            確認入庫資料
          </h1>
          <dl className="mt-5 grid grid-cols-3 gap-6 max-w-md">
            <div>
              <dt className="text-xs text-neutral-400 mb-1">管理員</dt>
              <dd className="text-sm font-medium text-neutral-900">
                {adminName || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400 mb-1">時間</dt>
              <dd className="text-sm font-medium text-neutral-900">
                {checkinTimeText}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400 mb-1">數量</dt>
              <dd className="text-sm font-medium text-neutral-900 tabular-nums">
                {books.length} 本
              </dd>
            </div>
          </dl>
        </header>

        {errorMsg && (
          <div className="no-print mb-6 px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        <section className="no-print">
          <h2 className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-4">
            書籍列表
          </h2>
          <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
            {books.map((b) => (
              <li
                key={b.bookId}
                className="py-4 flex gap-4 items-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.imageDataUrl}
                  alt={b.title}
                  className="w-12 h-16 object-cover rounded border border-neutral-200"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-900 truncate">
                    {b.title}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1 font-mono">
                    {b.bookId}
                  </p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.qrDataUrl}
                  alt="qr"
                  className="w-12 h-12 opacity-90"
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-4 no-print">
            標籤預覽
          </h2>
          <div className="print-area grid grid-cols-1 sm:grid-cols-2 gap-4">
            {books.map((b) => (
              <LabelCard key={b.bookId} book={b} />
            ))}
          </div>
        </section>

        <div className="no-print mt-12 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            onClick={handlePrint}
            className="sm:min-w-[140px] bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            列印標籤
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="sm:min-w-[160px] bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition disabled:bg-neutral-300 disabled:cursor-not-allowed"
          >
            {submitting ? "送出中" : "確認入庫"}
          </button>
        </div>
      </div>
    </main>
  );
}

function LabelCard({ book }: { book: LabelBook }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, book.bookId, {
        format: "CODE128",
        width: 1.6,
        height: 50,
        fontSize: 12,
        margin: 0,
        background: "#ffffff",
        lineColor: "#0a0a0a",
        displayValue: true,
      });
    } catch (err) {
      console.error("barcode render error", err);
    }
  }, [book.bookId]);

  return (
    <div className="print-label bg-white border border-neutral-200 rounded-xl p-5 flex flex-col items-center text-center break-inside-avoid">
      <p className="font-medium text-sm text-neutral-900 mb-3 line-clamp-2 min-h-[2.5em]">
        {book.title}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={book.qrDataUrl} alt="qr" className="w-28 h-28 mb-2" />
      <svg ref={svgRef} className="w-full max-w-[200px]" />
    </div>
  );
}
