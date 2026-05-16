"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { supabase, BookRow } from "@/lib/supabase";
import { recognizeBookCover } from "@/lib/ocr";
import { findBookByTitle } from "@/lib/titleMatch";
import BottomSheet from "@/components/BottomSheet";
import Toast, { type ToastKind } from "@/components/Toast";
import ZoomableImage from "@/components/ZoomableImage";

export default function ReturnScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanningRef = useRef(false);

  const [member, setMember] = useState("");
  const [candidates, setCandidates] = useState<BookRow[]>([]);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [pending, setPending] = useState<BookRow | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [notFoundOpen, setNotFoundOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  // 用來強制 useEffect 重啟相機（例如重複掃描、瞬時錯誤後）。
  const [scanGen, setScanGen] = useState(0);
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    kind: ToastKind;
  }>({ open: false, message: "", kind: "success" });

  const booksRef = useRef<BookRow[]>([]);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("currentMember");
    if (!stored) {
      router.replace("/");
      return;
    }
    setMember(stored);
  }, [router]);

  // 拉「自己目前借出」候選清單給拍照辨識比對使用
  useEffect(() => {
    if (!member) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("current_holder", member);
      if (!alive) return;
      if (!error) setCandidates((data ?? []) as BookRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [member]);

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // ignore
      }
      controlsRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      try {
        const s = videoRef.current.srcObject as MediaStream;
        s.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      videoRef.current.srcObject = null;
    }
  }, []);

  const flashAlreadyAdded = useCallback((title: string) => {
    setToast({
      open: true,
      message: `已在清單中：${title}`,
      kind: "info",
    });
  }, []);

  const handleQrScanned = useCallback(
    async (id: string) => {
      setBusy(true);
      setErrorMsg(null);
      try {
        const dup = booksRef.current.find((b) => b.book_id === id);
        if (dup) {
          flashAlreadyAdded(dup.title);
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
        if (book.status === "available") {
          setErrorMsg("這本書狀態為「在庫」，無須還書");
          return;
        }
        setPending(book);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        setErrorMsg(`查詢失敗：${m}`);
      } finally {
        setBusy(false);
        setScanGen((g) => g + 1);
      }
    },
    [flashAlreadyAdded],
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
            void handleQrScanned(text);
          }
        },
      );
      controlsRef.current = controls;
      try {
        await videoRef.current.play();
      } catch {
        // ignore silent autoplay rejections
      }
    } catch (err) {
      scanningRef.current = false;
      const m = err instanceof Error ? err.message : String(err);
      setErrorMsg(`相機初始化失敗：${m}`);
    }
  }, [handleQrScanned, stopScanner]);

  useEffect(() => {
    if (!member) return;
    if (!pending && !listOpen && !notFoundOpen && !capturing) {
      void startScanner();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [
    member,
    pending,
    listOpen,
    notFoundOpen,
    capturing,
    scanGen,
    startScanner,
    stopScanner,
  ]);

  const handlePhotoCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setErrorMsg("相機尚未就緒，請稍候再試。");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

    stopScanner();
    setCapturing(true);
    setErrorMsg(null);

    try {
      const { title } = await recognizeBookCover(dataUrl);
      if (!title) {
        setNotFoundOpen(true);
        return;
      }
      // 全部 candidate（含已加入者）都比對，讓「已在清單中」的書能明確提示。
      const match = findBookByTitle(title, candidates);
      if (!match) {
        setNotFoundOpen(true);
        return;
      }
      if (booksRef.current.some((b) => b.book_id === match.book_id)) {
        flashAlreadyAdded(match.title);
        return;
      }
      setPending(match);
    } catch (err) {
      console.error("recognize error", err);
      setNotFoundOpen(true);
    } finally {
      setCapturing(false);
    }
  }, [candidates, flashAlreadyAdded, stopScanner]);

  const handleAdd = useCallback(() => {
    if (!pending) return;
    setBooks((prev) => [...prev, pending]);
    setToast({
      open: true,
      message: `已加入：${pending.title}`,
      kind: "success",
    });
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
      const res = await fetch("/api/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookIds: books.map((b) => b.book_id),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      sessionStorage.removeItem("currentMember");
      sessionStorage.setItem(
        "pendingToast",
        JSON.stringify({
          message: `已成功歸還 ${books.length} 本書`,
          kind: "success",
        }),
      );
      setNavigating(true);
      router.push("/");
    } catch (err) {
      alert(`還書失敗：${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
    }
  }, [books, router, submitting]);

  const handleClose = useCallback(() => {
    setNavigating(true);
    stopScanner();
    router.push("/");
  }, [router, stopScanner]);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="focus-frame w-72 h-96 max-w-[78%] max-h-[58%]">
            <span className="focus-bl" />
            <span className="focus-br" />
          </div>
        </div>

        <div className="absolute top-4 inset-x-0 flex flex-col items-center gap-3 z-10 px-6">
          <p className="text-xs text-white/70 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
            {busy
              ? "查詢中…"
              : `對準書本 QR 自動偵測，或點下方按鈕拍封面辨識 · ${member}`}
          </p>
          {errorMsg && (
            <p className="text-xs bg-red-500/30 text-white px-3 py-1.5 rounded-full max-w-xs text-center">
              {errorMsg}
            </p>
          )}
        </div>

        <div className="absolute bottom-8 inset-x-0 flex flex-col items-center z-10 px-6">
          <button
            type="button"
            onClick={handlePhotoCapture}
            aria-label="拍封面辨識"
            className="w-[68px] h-[68px] rounded-full bg-white/10 backdrop-blur-md border-2 border-white/80 active:scale-95 transition flex items-center justify-center"
          >
            <span className="block w-[52px] h-[52px] rounded-full bg-white" />
          </button>
        </div>

        {capturing && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6 z-20">
            <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
            <p className="text-sm text-white/80">辨識中</p>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 px-4 pt-3 pb-6 bg-black/70 backdrop-blur-md z-20">
        <button
          type="button"
          onClick={handleClose}
          className="w-9 h-9 rounded-full bg-white hover:bg-neutral-100 text-neutral-900 flex items-center justify-center transition"
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
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="relative h-9 inline-flex items-center bg-white hover:bg-neutral-100 text-neutral-900 text-[13px] font-medium px-4 rounded-full transition"
        >
          前往還書 ({books.length})
          {books.length > 0 && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-black/70"
              aria-hidden
            />
          )}
        </button>
      </footer>

      {pending && (
        <BottomSheet
          open
          onClose={handleSkip}
          title="是這本嗎？"
          subtitle={pending.title}
          footer={
            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
              >
                略過
              </button>
              <button
                onClick={handleAdd}
                className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
              >
                加入還書清單
              </button>
            </div>
          }
        >
          <div className="flex gap-4 items-start pb-3">
            {pending.image_url ? (
              <ZoomableImage
                src={pending.image_url}
                alt={pending.title}
                className="w-20 h-28 object-cover rounded-md border border-neutral-100"
              />
            ) : (
              <div className="w-20 h-28 rounded-md bg-neutral-100" />
            )}
            <dl className="flex-1 text-sm space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">編號</dt>
                <dd className="font-mono text-neutral-900">
                  {pending.book_id}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">目前持有</dt>
                <dd className="text-neutral-900">
                  {pending.current_holder ?? "—"}
                </dd>
              </div>
            </dl>
          </div>
          {pending.current_holder !== member && (
            <p className="text-xs bg-amber-50 text-amber-800 border border-amber-100 rounded-lg px-3 py-2 mb-2">
              此書並非由你（{member}）借出。仍要繼續歸還？
            </p>
          )}
        </BottomSheet>
      )}

      <BottomSheet
        open={notFoundOpen}
        onClose={() => setNotFoundOpen(false)}
        title="庫存沒有此書"
        subtitle="你目前的借閱清單中沒有這本書"
        footer={
          <button
            onClick={() => setNotFoundOpen(false)}
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
          >
            重新掃描
          </button>
        }
      >
        <p className="text-sm text-neutral-600 pb-4">
          可能原因：書名拍攝不清、或這本書不是你借出的。請改用書本上的 QR Code 掃描，或重新拍清楚書封。
        </p>
      </BottomSheet>

      <BottomSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={`已選 ${books.length} 本書`}
        subtitle={`還書人：${member}`}
        footer={
          <button
            onClick={handleSubmit}
            disabled={books.length === 0 || submitting}
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-lg transition disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
          >
            {submitting ? "送出中…" : "完成還書"}
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
                  <ZoomableImage
                    src={b.image_url}
                    alt={b.title}
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

      <Toast
        open={toast.open}
        message={toast.message}
        kind={toast.kind}
        duration={1000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />

      {navigating && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <div className="w-9 h-9 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
