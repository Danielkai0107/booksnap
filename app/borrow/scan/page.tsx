"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { supabase, BookRow } from "@/lib/supabase";
import BottomSheet from "@/components/BottomSheet";

type PendingBook = BookRow;

export default function BorrowScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanningRef = useRef(false);

  const [member, setMember] = useState("");
  const [books, setBooks] = useState<BookRow[]>([]);
  const [pending, setPending] = useState<PendingBook | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("currentMember");
    if (!stored) {
      router.replace("/");
      return;
    }
    setMember(stored);
  }, [router]);

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
  }, []);

  const handleBookScanned = useCallback(
    async (id: string) => {
      setBusy(true);
      setErrorMsg(null);
      try {
        if (books.some((b) => b.book_id === id)) {
          setErrorMsg("此書已在清單中");
          return;
        }
        const { data, error } = await supabase
          .from("books")
          .select("*")
          .eq("book_id", id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          setErrorMsg(`找不到書本：${id}`);
          return;
        }
        const book = data as BookRow;
        if (book.status === "borrowed" && book.current_holder === member) {
          setErrorMsg("這本書已經在你手上");
          return;
        }
        setPending(book);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        setErrorMsg(`查詢失敗：${m}`);
      } finally {
        setBusy(false);
      }
    },
    [books, member]
  );

  const startScanner = useCallback(async () => {
    if (!videoRef.current || scanningRef.current) return;
    stopScanner();
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }
    scanningRef.current = true;
    setErrorMsg(null);
    try {
      const controls = await readerRef.current.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result) => {
          if (result) {
            const text = result.getText();
            stopScanner();
            void handleBookScanned(text);
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      scanningRef.current = false;
      const m = err instanceof Error ? err.message : String(err);
      setErrorMsg(`相機初始化失敗：${m}`);
    }
  }, [handleBookScanned, stopScanner]);

  useEffect(() => {
    if (!member) return;
    if (!pending && !listOpen) {
      void startScanner();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [member, pending, listOpen, startScanner, stopScanner]);

  const handleAdd = useCallback(() => {
    if (!pending) return;
    setBooks((prev) => [...prev, pending]);
    setPending(null);
  }, [pending]);

  const handleSkip = useCallback(() => {
    setPending(null);
  }, []);

  const handleRemove = useCallback((bookId: string) => {
    setBooks((prev) => prev.filter((b) => b.book_id !== bookId));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (books.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrowerName: member,
          bookIds: books.map((b) => b.book_id),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      sessionStorage.removeItem("currentMember");
      router.push("/");
    } catch (err) {
      alert(`借書失敗：${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
    }
  }, [books, member, router, submitting]);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-md z-20 gap-3">
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-[13px] font-medium px-3.5 py-1.5 rounded-full transition"
        >
          借書 ({books.length})
        </button>
        <button
          type="button"
          onClick={() => {
            stopScanner();
            router.push("/");
          }}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center transition"
          aria-label="關閉"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 1L13 13M13 1L1 13"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="focus-frame w-72 h-72 max-w-[78%] max-h-[58%]">
            <span className="focus-bl" />
            <span className="focus-br" />
          </div>
        </div>
        <div className="absolute bottom-10 inset-x-0 flex flex-col items-center gap-3 z-10 px-6">
          <p className="text-xs text-white/70 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
            {busy ? "查詢中…" : `掃描書本 QR · ${member}`}
          </p>
          {errorMsg && (
            <p className="text-xs bg-red-500/30 text-white px-3 py-1.5 rounded-full max-w-xs text-center">
              {errorMsg}
            </p>
          )}
        </div>
      </div>

      {pending && (
        <BookConfirmSheet
          book={pending}
          currentMember={member}
          actionLabel="加入借書清單"
          onAction={handleAdd}
          onCancel={handleSkip}
        />
      )}

      <BottomSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={`已選 ${books.length} 本書`}
        subtitle={`借書人：${member}`}
        footer={
          <button
            onClick={handleSubmit}
            disabled={books.length === 0 || submitting}
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-lg transition disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
          >
            {submitting ? "送出中…" : "完成借書"}
          </button>
        }
      >
        {books.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            尚未掃描任何書本
          </p>
        ) : (
          <ul className="space-y-3 pb-2">
            {books.map((b) => (
              <li
                key={b.book_id}
                className="flex gap-3 items-center border border-neutral-100 rounded-xl p-3"
              >
                {b.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.image_url}
                    alt=""
                    className="w-12 h-16 object-cover rounded-md border border-neutral-100"
                  />
                ) : (
                  <div className="w-12 h-16 rounded-md bg-neutral-100" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {b.title}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">{b.book_id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(b.book_id)}
                  className="text-xs text-neutral-400 hover:text-red-500 transition"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>
    </div>
  );
}

function BookConfirmSheet({
  book,
  currentMember,
  actionLabel,
  onAction,
  onCancel,
}: {
  book: BookRow;
  currentMember: string;
  actionLabel: string;
  onAction: () => void;
  onCancel: () => void;
}) {
  const warningOther =
    book.status === "borrowed" &&
    book.current_holder &&
    book.current_holder !== currentMember;

  return (
    <BottomSheet
      open
      onClose={onCancel}
      title={book.title}
      footer={
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            略過
          </button>
          <button
            onClick={onAction}
            className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
          >
            {actionLabel}
          </button>
        </div>
      }
    >
      <div className="flex gap-4 items-start pb-3">
        {book.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.image_url}
            alt=""
            className="w-20 h-28 object-cover rounded-md border border-neutral-100"
          />
        ) : (
          <div className="w-20 h-28 rounded-md bg-neutral-100" />
        )}
        <dl className="flex-1 text-sm space-y-2">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-400">編號</dt>
            <dd className="font-mono text-neutral-900">{book.book_id}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-400">狀態</dt>
            <dd>
              {book.status === "available" ? (
                <span className="text-emerald-700">在庫</span>
              ) : (
                <span className="text-neutral-700">已借出</span>
              )}
            </dd>
          </div>
          {book.current_holder && (
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-400">目前持有</dt>
              <dd className="text-neutral-900">{book.current_holder}</dd>
            </div>
          )}
        </dl>
      </div>
      {warningOther && (
        <p className="text-xs bg-amber-50 text-amber-800 border border-amber-100 rounded-lg px-3 py-2 mb-2">
          此書目前在「{book.current_holder}」手上。若仍要加入，會覆蓋為「
          {currentMember}」借出。
        </p>
      )}
    </BottomSheet>
  );
}
