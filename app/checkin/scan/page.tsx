"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recognizeBookCover } from "@/lib/ocr";
import { formatDateYMD, generateBookId } from "@/lib/bookId";
import { supabase } from "@/lib/supabase";
import BottomSheet from "@/components/BottomSheet";

type Mode = "loading" | "camera" | "processing" | "confirming";

type ConfirmedBook = {
  title: string;
  imageDataUrl: string;
};

type CurrentCapture = {
  imageDataUrl: string;
  detectedTitle: string;
};

type DuplicateMatch = {
  book_id: string;
  title: string;
  image_url: string | null;
  checkin_time: string;
  status: string;
  current_holder: string | null;
};

const BOOKS_KEY = "books";
const ADMIN_KEY = "adminName";

export default function CheckinScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [confirmedBooks, setConfirmedBooks] = useState<ConfirmedBook[]>([]);
  const [currentCapture, setCurrentCapture] = useState<CurrentCapture | null>(
    null
  );
  const [editedTitle, setEditedTitle] = useState("");
  const [adminName, setAdminName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 重複偵測
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [duplicateBase, setDuplicateBase] = useState("");

  // 書單彈窗
  const [listOpen, setListOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(ADMIN_KEY);
    if (!stored) {
      router.replace("/checkin");
      return;
    }
    setAdminName(stored);
    const existingBooks = sessionStorage.getItem(BOOKS_KEY);
    if (existingBooks) {
      try {
        setConfirmedBooks(JSON.parse(existingBooks));
      } catch {
        sessionStorage.removeItem(BOOKS_KEY);
      }
    }
  }, [router]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const attachStreamToVideo = useCallback(async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    try {
      await video.play();
    } catch (err) {
      console.warn("[scan] video.play() rejected", err);
    }
  }, []);

  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      await attachStreamToVideo();
    } catch (err) {
      console.error("camera error", err);
      const name = err instanceof Error ? err.name : "";
      let msg: string;
      if (name === "NotAllowedError" || name === "SecurityError") {
        msg =
          "相機權限被拒。請點網址列左側的鎖頭圖示，將「相機」改為允許後重新整理頁面。";
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        msg = "找不到可用的相機裝置。";
      } else if (name === "NotReadableError") {
        msg = "相機正被其他應用程式使用，請關閉後再試。";
      } else if (
        typeof window !== "undefined" &&
        window.location.protocol !== "https:" &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1"
      ) {
        msg =
          "手機相機需要 HTTPS 連線。請改用 localhost 或部署到 HTTPS 環境（例：Vercel）。";
      } else {
        msg = `相機初始化失敗：${err instanceof Error ? err.message : String(err)}`;
      }
      setErrorMsg(msg);
      setMode("camera");
    }
  }, [attachStreamToVideo]);

  useEffect(() => {
    if (!adminName) return;
    startCamera();
    return () => {
      stopStream();
    };
  }, [adminName, startCamera, stopStream]);

  useEffect(() => {
    if (mode === "camera" && streamRef.current) {
      void attachStreamToVideo();
    }
  }, [mode, attachStreamToVideo]);

  const handleCapture = useCallback(async () => {
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
    const base64 = canvas.toDataURL("image/jpeg", 0.8);

    stopStream();
    setMode("processing");
    setCurrentCapture({ imageDataUrl: base64, detectedTitle: "" });

    try {
      const { title } = await recognizeBookCover(base64);
      const finalTitle = title?.trim() ?? "";
      setCurrentCapture({ imageDataUrl: base64, detectedTitle: finalTitle });
      setEditedTitle(finalTitle);
      setMode("confirming");
    } catch (err) {
      console.error("recognize error", err);
      setCurrentCapture({ imageDataUrl: base64, detectedTitle: "" });
      setEditedTitle("");
      setMode("confirming");
    }
  }, [stopStream]);

  const addBook = useCallback(
    (title: string) => {
      if (!currentCapture) return;
      const next: ConfirmedBook[] = [
        ...confirmedBooks,
        { title, imageDataUrl: currentCapture.imageDataUrl },
      ];
      setConfirmedBooks(next);
      sessionStorage.setItem(BOOKS_KEY, JSON.stringify(next));
      setCurrentCapture(null);
      setEditedTitle("");
      startCamera();
    },
    [confirmedBooks, currentCapture, startCamera]
  );

  const handleConfirm = useCallback(async () => {
    const raw = editedTitle.trim() || "未命名書籍";

    try {
      const res = await fetch(
        `/api/books/check-title?title=${encodeURIComponent(raw)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        base?: string;
        matches?: DuplicateMatch[];
      };
      if (data.matches && data.matches.length > 0) {
        setDuplicateBase(data.base ?? raw);
        setDuplicateMatches(data.matches);
        setDuplicateOpen(true);
        return;
      }
    } catch (err) {
      console.warn("[checkin] check-title failed, proceeding", err);
    }
    addBook(raw);
  }, [editedTitle, addBook]);

  const handleRetake = useCallback(() => {
    setCurrentCapture(null);
    setEditedTitle("");
    startCamera();
  }, [startCamera]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateOpen(false);
    setDuplicateMatches([]);
    setDuplicateBase("");
    setCurrentCapture(null);
    setEditedTitle("");
    startCamera();
  }, [startCamera]);

  const handleDuplicateNewCopy = useCallback(() => {
    const nextNum = duplicateMatches.length + 1;
    const suffixed = `${duplicateBase} (${nextNum})`;
    setDuplicateOpen(false);
    setDuplicateMatches([]);
    setDuplicateBase("");
    addBook(suffixed);
  }, [duplicateBase, duplicateMatches.length, addBook]);

  const handleSubmit = useCallback(async () => {
    if (confirmedBooks.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const ymd = formatDateYMD(now);
      const prefix = `LIB-${ymd}-`;
      let startSeq = 1;
      try {
        const { data: existing } = await supabase
          .from("books")
          .select("book_id")
          .like("book_id", `${prefix}%`)
          .order("book_id", { ascending: false })
          .limit(1);
        const lastId = existing?.[0]?.book_id as string | undefined;
        if (lastId) {
          const lastSeq = parseInt(lastId.slice(prefix.length), 10);
          if (!Number.isNaN(lastSeq)) startSeq = lastSeq + 1;
        }
      } catch (err) {
        console.warn("[checkin] failed to fetch existing book_ids", err);
      }

      const payload = {
        adminName,
        books: confirmedBooks.map((b, idx) => ({
          title: b.title,
          bookId: generateBookId(now, startSeq + idx),
          imageBase64: b.imageDataUrl,
        })),
      };

      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      sessionStorage.removeItem(BOOKS_KEY);
      sessionStorage.removeItem(ADMIN_KEY);
      router.push("/admin");
    } catch (err) {
      console.error("[checkin] submit failed", err);
      alert(`入庫失敗：${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
    }
  }, [adminName, confirmedBooks, router, submitting]);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur-md z-20 gap-3">
        <button
          type="button"
          onClick={() => {
            stopStream();
            router.push("/admin");
          }}
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
          className="bg-white hover:bg-neutral-100 text-neutral-900 text-[13px] font-medium px-3.5 py-1.5 rounded-full transition"
        >
          全部入庫 ({confirmedBooks.length})
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {mode === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-sm text-white/80">啟動相機中</p>
          </div>
        )}

        {(mode === "camera" || mode === "processing") && (
          <>
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
            {errorMsg && !streamRef.current && (
              <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
                <div className="bg-white text-neutral-900 max-w-sm w-full rounded-2xl p-6 shadow-2xl">
                  <p className="text-sm leading-relaxed text-neutral-700 mb-5">
                    {errorMsg}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        stopStream();
                        router.push("/");
                      }}
                      className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
                    >
                      回首頁
                    </button>
                    <button
                      onClick={() => startCamera()}
                      className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
                    >
                      重新嘗試
                    </button>
                  </div>
                </div>
              </div>
            )}
            {mode === "camera" && !errorMsg && (
              <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-6 z-10 px-6">
                <p className="text-xs text-white/70 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
                  對準書封拍照辨識 · {adminName || "—"}
                </p>
                <button
                  onClick={handleCapture}
                  aria-label="拍照"
                  className="w-[68px] h-[68px] rounded-full bg-white/10 backdrop-blur-md border-2 border-white/80 active:scale-95 transition flex items-center justify-center"
                >
                  <span className="block w-[52px] h-[52px] rounded-full bg-white" />
                </button>
              </div>
            )}
            {mode === "processing" && currentCapture && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentCapture.imageDataUrl}
                  alt="captured"
                  className="w-36 h-48 object-cover rounded-lg mb-5 border border-white/10"
                />
                <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
                <p className="text-sm text-white/80">辨識中</p>
              </div>
            )}
          </>
        )}

        {mode === "confirming" && currentCapture && (
          <div className="absolute inset-0 bg-black/50 flex items-end z-30">
            <div className="w-full bg-white text-neutral-900 rounded-t-3xl px-6 pt-6 pb-8 animate-slide-up max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-5" />
              <div className="flex gap-4 items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentCapture.imageDataUrl}
                  alt="cover"
                  className="w-20 h-28 object-cover rounded-md border border-neutral-200"
                />
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                    書名
                  </label>
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="w-full border border-neutral-200 rounded-md px-3 py-2 text-base focus:outline-none focus:border-neutral-900 transition"
                    placeholder="輸入書名"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleRetake}
                  className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
                >
                  重拍
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
                >
                  加入書單
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomSheet
        open={duplicateOpen}
        onClose={handleDuplicateCancel}
        title="這本書好像已經在館藏中"
        subtitle={`已找到 ${duplicateMatches.length} 本同名書`}
        footer={
          <div className="flex gap-3">
            <button
              onClick={handleDuplicateCancel}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
            >
              是同一本（取消）
            </button>
            <button
              onClick={handleDuplicateNewCopy}
              className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
            >
              新添購（加入 ({duplicateMatches.length + 1})）
            </button>
          </div>
        }
      >
        <ul className="space-y-3 pb-2">
          {duplicateMatches.map((m) => (
            <li
              key={m.book_id}
              className="flex gap-3 items-start border border-neutral-100 rounded-xl p-3"
            >
              {m.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.image_url}
                  alt=""
                  className="w-14 h-20 object-cover rounded-md border border-neutral-100"
                />
              ) : (
                <div className="w-14 h-20 rounded-md bg-neutral-100" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {m.title}
                </p>
                <p className="text-xs text-neutral-500 mt-1">{m.book_id}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {new Date(m.checkin_time).toLocaleString("zh-TW")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <BottomSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={`已掃 ${confirmedBooks.length} 本書`}
        subtitle={adminName ? `負責人：${adminName}` : undefined}
        footer={
          <button
            onClick={handleSubmit}
            disabled={confirmedBooks.length === 0 || submitting}
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-lg transition disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
          >
            {submitting ? "送出中…" : "完成入庫"}
          </button>
        }
      >
        {confirmedBooks.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            尚未掃描任何書本
          </p>
        ) : (
          <ul className="space-y-3 pb-2">
            {confirmedBooks.map((b, idx) => (
              <li
                key={idx}
                className="flex gap-3 items-center border border-neutral-100 rounded-xl p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.imageDataUrl}
                  alt=""
                  className="w-12 h-16 object-cover rounded-md border border-neutral-100"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {b.title}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">#{idx + 1}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = confirmedBooks.filter((_, i) => i !== idx);
                    setConfirmedBooks(next);
                    sessionStorage.setItem(BOOKS_KEY, JSON.stringify(next));
                  }}
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
