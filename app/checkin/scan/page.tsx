"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recognizeBookCover } from "@/lib/ocr";

type Mode = "loading" | "camera" | "processing" | "confirming";

type ConfirmedBook = {
  title: string;
  imageDataUrl: string;
};

type CurrentCapture = {
  imageDataUrl: string;
  detectedTitle: string;
};

const BOOKS_KEY = "books";
const ADMIN_KEY = "adminName";

export default function ScanPage() {
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
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
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

  // Re-attach stream whenever the video element re-mounts (e.g. after returning
  // from "processing" -> "camera"), in case the ref changed identity.
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
      const finalTitle = title && title.trim().length > 0 ? title.trim() : "";
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

  const handleConfirm = useCallback(() => {
    if (!currentCapture) return;
    const next: ConfirmedBook[] = [
      ...confirmedBooks,
      {
        title: editedTitle.trim() || "未命名書籍",
        imageDataUrl: currentCapture.imageDataUrl,
      },
    ];
    setConfirmedBooks(next);
    sessionStorage.setItem(BOOKS_KEY, JSON.stringify(next));
    setCurrentCapture(null);
    setEditedTitle("");
    startCamera();
  }, [confirmedBooks, currentCapture, editedTitle, startCamera]);

  const handleRetake = useCallback(() => {
    setCurrentCapture(null);
    setEditedTitle("");
    startCamera();
  }, [startCamera]);

  const handleFinish = useCallback(() => {
    stopStream();
    sessionStorage.setItem(BOOKS_KEY, JSON.stringify(confirmedBooks));
    router.push("/checkin/result");
  }, [confirmedBooks, router, stopStream]);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <header className="flex items-center justify-between px-5 py-3.5 bg-black/85 backdrop-blur-md z-20 border-b border-white/5 gap-3">
        <Link
          href="/"
          onClick={stopStream}
          className="text-[13px] text-white/60 hover:text-white transition shrink-0"
        >
          返回
        </Link>
        <div className="text-[13px] flex items-center gap-2 min-w-0 flex-1 justify-center">
          <span className="text-white/50">管理員</span>
          <span className="text-white font-medium truncate max-w-[6em]">
            {adminName || "—"}
          </span>
          <span className="text-white/20">·</span>
          <span className="text-white/50">已確認</span>
          <span className="text-white font-medium tabular-nums">
            {confirmedBooks.length}
          </span>
        </div>
        <button
          onClick={handleFinish}
          className="bg-white text-neutral-900 text-[13px] font-medium px-4 py-1.5 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-100 transition shrink-0"
          disabled={confirmedBooks.length === 0}
        >
          結束入庫
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
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-2">
                    無法開啟相機
                  </p>
                  <p className="text-sm leading-relaxed text-neutral-700">
                    {errorMsg}
                  </p>
                  <div className="flex gap-3 mt-5">
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
            {errorMsg && streamRef.current && (
              <div className="absolute top-3 inset-x-3 z-10 text-xs bg-black/80 text-white px-3 py-2 rounded-md border border-white/10">
                {errorMsg}
              </div>
            )}
            {mode === "camera" && !errorMsg && (
              <div className="absolute bottom-10 inset-x-0 flex justify-center z-10">
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
                  {currentCapture.detectedTitle && (
                    <p className="text-xs text-neutral-400 mt-1.5">
                      辨識結果：{currentCapture.detectedTitle}
                    </p>
                  )}
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
    </div>
  );
}
