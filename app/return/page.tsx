"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { supabase, BookRow, ShelfRow } from "@/lib/supabase";

type Step = "shelf" | "shelf_confirm" | "book" | "book_confirm" | "done";

export default function ReturnPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanningRef = useRef(false);

  const [step, setStep] = useState<Step>("shelf");
  const [shelf, setShelf] = useState<ShelfRow | null>(null);
  const [scannedBook, setScannedBook] = useState<BookRow | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
  }, []);

  const handleShelfScanned = useCallback(async (id: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from("shelves")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setErrorMsg(`找不到書架：${id}`);
        return;
      }
      setShelf(data as ShelfRow);
      setStep("shelf_confirm");
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setErrorMsg(`查詢書架失敗：${m}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleBookScanned = useCallback(async (id: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
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
      setScannedBook(data as BookRow);
      setStep("book_confirm");
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setErrorMsg(`查詢書本失敗：${m}`);
    } finally {
      setBusy(false);
    }
  }, []);

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
            if (step === "shelf") {
              void handleShelfScanned(text);
            } else if (step === "book") {
              void handleBookScanned(text);
            }
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      scanningRef.current = false;
      const m = err instanceof Error ? err.message : String(err);
      setErrorMsg(`相機初始化失敗：${m}`);
    }
  }, [handleBookScanned, handleShelfScanned, step, stopScanner]);

  useEffect(() => {
    if (step === "shelf" || step === "book") {
      void startScanner();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [step, startScanner, stopScanner]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleConfirmShelf = () => {
    setStep("book");
  };

  const handleChangeShelf = () => {
    setShelf(null);
    setScannedBook(null);
    setStep("shelf");
  };

  const handleConfirmReturn = async () => {
    if (!scannedBook || !shelf) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: scannedBook.book_id,
          shelfId: shelf.id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      setStep("done");
      setCountdown(2);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setErrorMsg(`還書失敗：${m}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (step !== "done") return;
    if (countdown <= 0) {
      setScannedBook(null);
      setStep("book");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [step, countdown]);

  const handleCancelBook = () => {
    setScannedBook(null);
    setStep("book");
  };

  const showVideo = step === "shelf" || step === "book";

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <nav className="w-full border-b border-white/5">
        <div className="max-w-md mx-auto px-5 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-white/50 hover:text-white transition"
          >
            返回
          </Link>
          <div className="text-sm">
            {shelf ? (
              <span className="text-white">
                <span className="text-white/40">書架</span>
                <span className="ml-2 font-medium">
                  {shelf.label || shelf.id}
                </span>
              </span>
            ) : (
              <span className="text-white/40">尚未選擇書架</span>
            )}
          </div>
          {shelf ? (
            <button
              onClick={handleChangeShelf}
              className="text-xs text-white/70 hover:text-white border border-white/15 hover:border-white/30 px-3 py-1 rounded-md transition"
            >
              換書架
            </button>
          ) : (
            <span className="w-12" />
          )}
        </div>
      </nav>

      <section className="min-h-[calc(100vh-3.5rem)] pb-10 px-5 flex flex-col items-center justify-center max-w-md mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-white/30 mt-6 mb-5">
          {step === "shelf" || step === "shelf_confirm"
            ? "Step 1 · Shelf"
            : "Step 2 · Book"}
        </p>

        <div
          className={`relative w-full aspect-[3/4] bg-black rounded-2xl overflow-hidden border border-white/5 ${
            showVideo ? "" : "hidden"
          }`}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="focus-frame w-56 h-56">
              <span className="focus-bl" />
              <span className="focus-br" />
            </div>
          </div>
          <div className="absolute bottom-3 inset-x-3 text-center text-xs bg-black/60 backdrop-blur-sm py-2 rounded-md border border-white/5">
            {step === "shelf"
              ? "請掃描書架上的 QR Code"
              : "請掃描書本 QR Code"}
            {busy && "（處理中）"}
          </div>
        </div>

        {step === "shelf_confirm" && shelf && (
          <div className="bg-white text-neutral-900 w-full rounded-2xl p-7 text-center animate-slide-up shadow-xl">
            <p className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
              已掃到書架
            </p>
            <p className="text-3xl font-semibold tracking-tight">
              {shelf.label || shelf.id}
            </p>
            <p className="text-xs text-neutral-400 mt-2 font-mono">
              {shelf.id}
            </p>
            <p className="text-sm text-neutral-500 mt-5">確認此書架？</p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleChangeShelf}
                className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
              >
                重掃
              </button>
              <button
                onClick={handleConfirmShelf}
                className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
              >
                確認
              </button>
            </div>
          </div>
        )}

        {step === "book_confirm" && scannedBook && shelf && (
          <div className="bg-white text-neutral-900 w-full rounded-2xl p-6 animate-slide-up shadow-xl">
            <p className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
              準備還書
            </p>
            <p className="text-xl font-semibold tracking-tight">
              {scannedBook.title}
            </p>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-400">編號</dt>
                <dd className="font-mono text-neutral-900">
                  {scannedBook.book_id}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-400">原入庫人員</dt>
                <dd className="text-neutral-900">{scannedBook.admin_name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-400">入庫時間</dt>
                <dd className="text-neutral-900 text-right">
                  {new Date(scannedBook.checkin_time).toLocaleString("zh-TW")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-400">目前狀態</dt>
                <dd>
                  <StatusPill status={scannedBook.status} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-400">還回書架</dt>
                <dd className="text-neutral-900 font-medium">
                  {shelf.label || shelf.id}
                </dd>
              </div>
            </dl>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCancelBook}
                className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
              >
                取消
              </button>
              <button
                onClick={handleConfirmReturn}
                disabled={busy}
                className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition disabled:bg-neutral-300 disabled:cursor-not-allowed"
              >
                {busy ? "處理中" : "確認還書"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="bg-white text-neutral-900 w-full rounded-2xl p-10 text-center animate-slide-up shadow-xl">
            <div className="mx-auto w-12 h-12 rounded-full border-2 border-neutral-900 flex items-center justify-center">
              <svg
                width="18"
                height="14"
                viewBox="0 0 18 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 6.5L6.5 12L17 1.5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-2xl font-semibold tracking-tight mt-5">
              還書完成
            </p>
            <p className="text-sm text-neutral-500 mt-3">
              {countdown} 秒後繼續掃描下一本
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 text-sm bg-red-500/10 text-red-300 border border-red-500/20 px-4 py-2.5 rounded-lg w-full text-center">
            {errorMsg}
          </div>
        )}
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "in") {
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
