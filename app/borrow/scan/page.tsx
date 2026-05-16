"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { supabase, BookRow } from "@/lib/supabase";
import { recognizeBookCover } from "@/lib/ocr";
import { findBestBookMatch } from "@/lib/titleMatch";
import { compressImageDataUrl } from "@/lib/imageCompress";
import BottomSheet from "@/components/BottomSheet";
import CameraErrorDialog from "@/components/CameraErrorDialog";
import Toast, { type ToastKind } from "@/components/Toast";
import ZoomableImage from "@/components/ZoomableImage";

export default function BorrowScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanningRef = useRef(false);

  const [member, setMember] = useState("");
  const [candidates, setCandidates] = useState<BookRow[]>([]);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [pending, setPending] = useState<BookRow | null>(null);
  /**
   * 該本書無法加入時的提示資訊。若為非空，BookConfirmSheet 會切到
   * 「請略過」模式：隱藏加入按鈕、在最下方顯示阻擋原因。
   */
  const [pendingBlocked, setPendingBlocked] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [notFoundOpen, setNotFoundOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** 相機 init 失敗 → 顯示重新請求對話框，技術錯誤訊息只進 console */
  const [cameraError, setCameraError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  // 用來強制 useEffect 重啟相機（例如瞬時錯誤訊息後）。
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

  // 拉「可出借」候選清單給拍照辨識比對使用
  useEffect(() => {
    if (!member) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("status", "available");
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
    // 確保 video 元素回到乾淨狀態，避免 iOS / Safari 在背景回來時黑屏。
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

  const handleQrScanned = useCallback(
    async (id: string) => {
      setBusy(true);
      setErrorMsg(null);
      try {
        const dup = booksRef.current.find((b) => b.book_id === id);
        if (dup) {
          setPendingBlocked({
            title: "已在清單中",
            message: "此書已在借書清單中，可略過繼續掃描下一本。",
          });
          setPending(dup);
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
          setPendingBlocked({
            title: "此書已在你手上",
            message: "這本書目前持有者是你，無須再借，可略過繼續掃描下一本。",
          });
          setPending(book);
          return;
        }
        setPendingBlocked(null);
        setPending(book);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        setErrorMsg(`查詢失敗：${m}`);
      } finally {
        setBusy(false);
        // 若這趟沒有開啟 pending 模態（例如僅 setErrorMsg），喚醒相機繼續掃描。
        setScanGen((g) => g + 1);
      }
    },
    [member],
  );

  const startScanner = useCallback(async () => {
    if (!videoRef.current || scanningRef.current) return;
    stopScanner();
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }
    scanningRef.current = true;
    setErrorMsg(null);
    setCameraError(false);
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
      // 保險：確保 video 在播放，避免某些瀏覽器在背景切回後停在第一幀。
      try {
        await videoRef.current.play();
      } catch {
        // some browsers reject silent play; ignore
      }
    } catch (err) {
      scanningRef.current = false;
      // 詳細錯誤只給 dev 排查，UI 顯示重新請求按鈕讓使用者重試。
      console.error("[borrow scan] camera init failed", err);
      setCameraError(true);
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
    // 直接抓原始解析度會讓 Claude vision 吃 ~1500 tokens。
    // 先壓到長邊 768 + JPEG 0.7，input tokens 約剩 1/3。
    const rawDataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const dataUrl = await compressImageDataUrl(rawDataUrl, {
      maxDimension: 768,
      quality: 0.7,
    });

    stopScanner();
    setCapturing(true);
    setErrorMsg(null);

    try {
      const { title } = await recognizeBookCover(dataUrl);
      if (!title) {
        setNotFoundOpen(true);
        return;
      }
      // 模糊比對：去副標題 / 雙向包含 / 編輯距離 / Jaccard，
      // 解決「Claude 多吐副標」與「DB 只存主書名」的常見不對齊。
      const result = findBestBookMatch(title, candidates);
      if (!result) {
        setNotFoundOpen(true);
        return;
      }
      const match = result.book;
      const inList = booksRef.current.some(
        (b) => b.book_id === match.book_id,
      );
      setPendingBlocked(
        inList
          ? {
              title: "已在清單中",
              message: "此書已在借書清單中，可略過繼續掃描下一本。",
            }
          : null,
      );
      setPending(match);
    } catch (err) {
      console.error("recognize error", err);
      setNotFoundOpen(true);
    } finally {
      setCapturing(false);
    }
  }, [candidates, stopScanner]);

  const handleAdd = useCallback(() => {
    if (!pending) return;
    setBooks((prev) => [...prev, pending]);
    setToast({
      open: true,
      message: `已加入：${pending.title}`,
      kind: "success",
    });
    setPending(null);
    setPendingBlocked(null);
  }, [pending]);

  const handleSkip = useCallback(() => {
    setPending(null);
    setPendingBlocked(null);
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
      sessionStorage.setItem(
        "pendingToast",
        JSON.stringify({
          message: `已成功借出 ${books.length} 本書`,
          kind: "success",
        }),
      );
      setNavigating(true);
      router.push("/");
    } catch (err) {
      alert(`借書失敗：${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
    }
  }, [books, member, router, submitting]);

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

      {cameraError && <CameraErrorDialog onRetry={() => startScanner()} onClose={handleClose} />}

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
          前往借書 ({books.length})
          {books.length > 0 && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-black/70"
              aria-hidden
            />
          )}
        </button>
      </footer>

      {pending && (
        <BookConfirmSheet
          book={pending}
          currentMember={member}
          actionLabel="加入借書清單"
          onAction={handleAdd}
          onCancel={handleSkip}
          blocked={pendingBlocked}
        />
      )}

      <BottomSheet
        open={notFoundOpen}
        onClose={() => setNotFoundOpen(false)}
        title="庫存沒有此書"
        subtitle="找不到符合的可借書本"
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
          可能原因：書名拍攝不清、書本目前已被借出、或館藏中沒有這本書。請改用書本上的 QR Code 掃描，或重新拍清楚書封。
        </p>
      </BottomSheet>

      <BottomSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={`已選 ${books.length} 本書`}
        subtitle={`借書人：${member}`}
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => setListOpen(false)}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3.5 rounded-lg transition"
            >
              繼續加入
            </button>
            <button
              onClick={handleSubmit}
              disabled={books.length === 0 || submitting}
              className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-lg transition disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
            >
              {submitting ? "送出中…" : "完成借書"}
            </button>
          </div>
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

function BookConfirmSheet({
  book,
  currentMember,
  actionLabel,
  onAction,
  onCancel,
  blocked = null,
}: {
  book: BookRow;
  currentMember: string;
  actionLabel: string;
  onAction: () => void;
  onCancel: () => void;
  blocked?: { title: string; message: string } | null;
}) {
  const isBlocked = blocked !== null;
  const warningOther =
    !isBlocked &&
    book.status === "borrowed" &&
    book.current_holder &&
    book.current_holder !== currentMember;

  return (
    <BottomSheet
      open
      onClose={onCancel}
      title={blocked?.title ?? "是這本嗎？"}
      subtitle={book.title}
      footer={
        isBlocked ? (
          <button
            onClick={onCancel}
            className="w-full bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            略過
          </button>
        ) : (
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
        )
      }
    >
      <div className="flex gap-4 items-start pb-3">
        {book.image_url ? (
          <ZoomableImage
            src={book.image_url}
            alt={book.title}
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
      {blocked && (
        <p className="text-xs bg-amber-50 text-amber-800 border border-amber-100 rounded-lg px-3 py-2 mb-2">
          {blocked.message}
        </p>
      )}
    </BottomSheet>
  );
}
