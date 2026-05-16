"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recognizeBookCover } from "@/lib/ocr";
import { type CategoryRow } from "@/lib/supabase";
import { normalizeForGoogleSearch, stripCopySuffix } from "@/lib/titleMatch";
import { useCheckinCart, type ConfirmedBook } from "@/lib/useCheckinCart";
import type { LookupCandidate } from "@/app/api/books/lookup/route";
import BottomSheet from "@/components/BottomSheet";
import CategorySelect from "@/components/CategorySelect";
import Toast, { type ToastKind } from "@/components/Toast";
import ZoomableImage from "@/components/ZoomableImage";

type Mode = "loading" | "camera" | "processing" | "looking-up" | "confirming";

type CaptureSource = "camera" | "barcode";

type CurrentCapture = {
  source: CaptureSource;
  /** 相機拍下的 base64；條碼模式為 null。 */
  imageDataUrl: string | null;
  /** Google 提供的封面 URL；條碼模式優先用，相機模式維持 null。 */
  remoteImageUrl: string | null;
  detectedTitle: string;
  suggestedCategoryId: string | null;
  pickedIsbn: string | null;
  pickedAuthors: string | null;
  pickedPublisher: string | null;
  pickedPublishedDate: string | null;
};

type DuplicateMatch = {
  book_id: string;
  title: string;
  image_url: string | null;
  checkin_time: string;
  status: string;
  current_holder: string | null;
};

// 為了不污染全域型別，只宣告必要 surface。
type BarcodeDetectorLike = {
  detect: (
    source: CanvasImageSource,
  ) => Promise<{ rawValue: string; format: string }[]>;
};

type BarcodeDetectorCtor = {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

export default function CheckinScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const nativeRunningRef = useRef(false);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastDetectedRef = useRef<{ isbn: string; at: number } | null>(null);

  const {
    adminName,
    books: confirmedBooks,
    totalCount,
    addBook: cartAddBook,
    removeBookAt,
    submitAll,
    submitting,
  } = useCheckinCart();
  const [mode, setMode] = useState<Mode>("loading");
  const [currentCapture, setCurrentCapture] = useState<CurrentCapture | null>(
    null,
  );
  const [editedTitle, setEditedTitle] = useState("");
  const [editedCategoryId, setEditedCategoryId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );

  // Google 候選清單（debounce）。只有相機 source 且尚未選一筆才會查。
  const [candidates, setCandidates] = useState<LookupCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [pickedCandidateKey, setPickedCandidateKey] = useState<string | null>(
    null,
  );

  // 重複偵測：分為「館藏中已有」與「目前清單中已有」兩段，序號要兩者一起算。
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>(
    [],
  );
  const [duplicateInList, setDuplicateInList] = useState<ConfirmedBook[]>([]);
  const [duplicateBase, setDuplicateBase] = useState("");

  const [listOpen, setListOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    kind: ToastKind;
  }>({ open: false, message: "", kind: "success" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { categories?: CategoryRow[] };
        if (!alive) return;
        setCategories(data.categories ?? []);
      } catch (err) {
        console.warn("[checkin] load categories failed", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const stopBarcodeScanners = useCallback(() => {
    nativeRunningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {
        // ignore
      }
      zxingControlsRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    stopBarcodeScanners();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [stopBarcodeScanners]);

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

  // 條碼掃到後的共用處理：lookup -> 進 confirming。
  const handleDetectedIsbn = useCallback(async (raw: string) => {
    const cleaned = raw.replace(/[-\s]/g, "");
    // EAN-13 中 978 / 979 才是 ISBN（書籍）；其他 prefix 是商品條碼，忽略。
    if (!/^97[89]\d{10}$/.test(cleaned)) return;

    // 1.5 秒內同一個 ISBN 不重複觸發。
    const now = Date.now();
    if (
      lastDetectedRef.current &&
      lastDetectedRef.current.isbn === cleaned &&
      now - lastDetectedRef.current.at < 1500
    ) {
      return;
    }
    lastDetectedRef.current = { isbn: cleaned, at: now };

    stopBarcodeScanners();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setMode("looking-up");
    setCurrentCapture({
      source: "barcode",
      imageDataUrl: null,
      remoteImageUrl: null,
      detectedTitle: "",
      suggestedCategoryId: null,
      pickedIsbn: cleaned,
      pickedAuthors: null,
      pickedPublisher: null,
      pickedPublishedDate: null,
    });

    let candidate: LookupCandidate | null = null;
    try {
      const res = await fetch(
        `/api/books/lookup?isbn=${encodeURIComponent(cleaned)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { candidates?: LookupCandidate[] };
      candidate = data.candidates?.[0] ?? null;
    } catch (err) {
      console.warn("[checkin] lookup-by-isbn failed", err);
    }

    setCurrentCapture({
      source: "barcode",
      imageDataUrl: null,
      remoteImageUrl: candidate?.thumbnail ?? null,
      detectedTitle: candidate?.title ?? "",
      suggestedCategoryId: null,
      pickedIsbn: cleaned,
      pickedAuthors:
        candidate && candidate.authors.length > 0
          ? candidate.authors.join("、")
          : null,
      pickedPublisher: candidate?.publisher ?? null,
      pickedPublishedDate: candidate?.publishedDate ?? null,
    });
    setEditedTitle(candidate?.title ?? "");
    setEditedCategoryId("");
    setCandidates([]);
    setPickedCandidateKey(null);
    setMode("confirming");
  }, [stopBarcodeScanners]);

  // 在已啟動的 video 上跑被動條碼偵測。原生優先，沒有就動態載 ZXing。
  const startBarcodeDetectorOnVideo = useCallback(
    async (video: HTMLVideoElement) => {
      stopBarcodeScanners();

      const Ctor = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
      ).BarcodeDetector;
      if (Ctor) {
        try {
          const supported = Ctor.getSupportedFormats
            ? await Ctor.getSupportedFormats()
            : ["ean_13"];
          const formats = ["ean_13"].filter((f) => supported.includes(f));
          if (formats.length > 0) {
            detectorRef.current = new Ctor({ formats });
            nativeRunningRef.current = true;
            const loop = async () => {
              if (!nativeRunningRef.current) return;
              const detector = detectorRef.current;
              if (detector) {
                try {
                  const codes = await detector.detect(video);
                  for (const code of codes) {
                    if (code.rawValue) {
                      void handleDetectedIsbn(code.rawValue);
                    }
                  }
                } catch {
                  // 單幀失敗就跳過，繼續下一幀。
                }
              }
              if (nativeRunningRef.current) {
                rafRef.current = requestAnimationFrame(loop);
              }
            };
            rafRef.current = requestAnimationFrame(loop);
            return;
          }
        } catch (err) {
          console.warn("[scan] native detector init failed, fallback", err);
        }
      }

      // Fallback: ZXing 1D 條碼解碼。
      try {
        const { BrowserMultiFormatOneDReader } = await import(
          "@zxing/browser"
        );
        const reader = new BrowserMultiFormatOneDReader();
        const controls = await reader.decodeFromVideoElement(
          video,
          (result) => {
            if (result) {
              const text = result.getText();
              if (text) void handleDetectedIsbn(text);
            }
          },
        );
        zxingControlsRef.current = controls;
      } catch (err) {
        console.error("[scan] zxing init failed", err);
      }
    },
    [handleDetectedIsbn, stopBarcodeScanners],
  );

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
      // 相機就緒後啟動被動條碼偵測。等下個 tick 確保 video 已 attach。
      const video = videoRef.current;
      if (video) {
        // 等 video 有實際尺寸再啟動 detector，避免空幀。
        if (video.readyState >= 2) {
          void startBarcodeDetectorOnVideo(video);
        } else {
          const onReady = () => {
            video.removeEventListener("loadeddata", onReady);
            void startBarcodeDetectorOnVideo(video);
          };
          video.addEventListener("loadeddata", onReady);
        }
      }
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
  }, [attachStreamToVideo, startBarcodeDetectorOnVideo]);

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

  // Debounce Google Books 查詢：使用者改書名時 300ms 後送出。
  // 只在 source === "camera" 時跑（條碼模式 ISBN 已經精準匹配，不需要再查）。
  // 已經選過候選 (pickedCandidateKey != null) 也暫停查詢，避免覆寫使用者選擇。
  useEffect(() => {
    if (mode !== "confirming") return;
    if (!currentCapture || currentCapture.source !== "camera") return;
    if (pickedCandidateKey) return;
    const query = normalizeForGoogleSearch(editedTitle);
    if (query.length < 2) {
      setCandidates([]);
      return;
    }
    let alive = true;
    setCandidatesLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/books/lookup?title=${encodeURIComponent(query)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (alive) setCandidates([]);
          return;
        }
        const data = (await res.json()) as { candidates?: LookupCandidate[] };
        if (!alive) return;
        setCandidates(data.candidates?.slice(0, 3) ?? []);
      } catch (err) {
        console.warn("[checkin] lookup failed", err);
        if (alive) setCandidates([]);
      } finally {
        if (alive) setCandidatesLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [editedTitle, mode, pickedCandidateKey, currentCapture]);

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
    setCandidates([]);
    setPickedCandidateKey(null);
    setCurrentCapture({
      source: "camera",
      imageDataUrl: base64,
      remoteImageUrl: null,
      detectedTitle: "",
      suggestedCategoryId: null,
      pickedIsbn: null,
      pickedAuthors: null,
      pickedPublisher: null,
      pickedPublishedDate: null,
    });

    try {
      const categoryNames = categories.map((c) => c.name);
      const { title, category } = await recognizeBookCover(
        base64,
        categoryNames,
      );
      const finalTitle = title?.trim() ?? "";
      const suggested = category
        ? (categories.find((c) => c.name === category) ?? null)
        : null;
      setCurrentCapture({
        source: "camera",
        imageDataUrl: base64,
        remoteImageUrl: null,
        detectedTitle: finalTitle,
        suggestedCategoryId: suggested?.id ?? null,
        pickedIsbn: null,
        pickedAuthors: null,
        pickedPublisher: null,
        pickedPublishedDate: null,
      });
      setEditedTitle(finalTitle);
      setEditedCategoryId(suggested?.id ?? "");
      setMode("confirming");
    } catch (err) {
      console.error("recognize error", err);
      setCurrentCapture({
        source: "camera",
        imageDataUrl: base64,
        remoteImageUrl: null,
        detectedTitle: "",
        suggestedCategoryId: null,
        pickedIsbn: null,
        pickedAuthors: null,
        pickedPublisher: null,
        pickedPublishedDate: null,
      });
      setEditedTitle("");
      setEditedCategoryId("");
      setMode("confirming");
    }
  }, [stopStream, categories]);

  const handlePickCandidate = useCallback((c: LookupCandidate) => {
    const key = c.isbn13 ?? c.isbn10 ?? c.title;
    setPickedCandidateKey(key);
    setEditedTitle(c.title);
    setCurrentCapture((cur) =>
      cur
        ? {
            ...cur,
            pickedIsbn: c.isbn13 ?? c.isbn10,
            pickedAuthors: c.authors.length > 0 ? c.authors.join("、") : null,
            pickedPublisher: c.publisher,
            pickedPublishedDate: c.publishedDate,
          }
        : cur,
    );
  }, []);

  const handleClearPickedCandidate = useCallback(() => {
    setPickedCandidateKey(null);
    setCurrentCapture((cur) =>
      cur
        ? {
            ...cur,
            pickedIsbn: null,
            pickedAuthors: null,
            pickedPublisher: null,
            pickedPublishedDate: null,
          }
        : cur,
    );
  }, []);

  const addBookAndNext = useCallback(
    (title: string) => {
      if (!currentCapture) return;
      cartAddBook({
        title,
        // 相機模式留下使用者拍的照片，條碼模式沒有照片就交給 Google 縮圖。
        imageDataUrl: currentCapture.imageDataUrl,
        remoteImageUrl:
          currentCapture.source === "barcode"
            ? currentCapture.remoteImageUrl
            : null,
        categoryId: editedCategoryId || null,
        isbn: currentCapture.pickedIsbn,
        authors: currentCapture.pickedAuthors,
        publisher: currentCapture.pickedPublisher,
        publishedDate: currentCapture.pickedPublishedDate,
      });
      setCurrentCapture(null);
      setEditedTitle("");
      setEditedCategoryId("");
      setCandidates([]);
      setPickedCandidateKey(null);
      lastDetectedRef.current = null;
      setToast({
        open: true,
        message: `已加入：${title}`,
        kind: "success",
      });
      startCamera();
    },
    [cartAddBook, currentCapture, editedCategoryId, startCamera],
  );

  const handleConfirm = useCallback(async () => {
    if (!currentCapture) return;
    const raw = editedTitle.trim() || "未命名書籍";
    const baseFromInput = stripCopySuffix(raw);

    const inList = confirmedBooks.filter((b) => {
      if (currentCapture.pickedIsbn && b.isbn) {
        return b.isbn === currentCapture.pickedIsbn;
      }
      return stripCopySuffix(b.title) === baseFromInput;
    });

    let dbMatches: DuplicateMatch[] = [];
    let baseTitle = baseFromInput;
    try {
      const params = new URLSearchParams();
      if (currentCapture.pickedIsbn) {
        params.set("isbn", currentCapture.pickedIsbn);
      }
      params.set("title", raw);
      const res = await fetch(
        `/api/books/check-duplicate?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        base?: string;
        matches?: DuplicateMatch[];
      };
      dbMatches = data.matches ?? [];
      baseTitle = data.base ?? baseFromInput;
    } catch (err) {
      console.warn("[checkin] check-duplicate failed, proceeding", err);
    }

    if (dbMatches.length > 0 || inList.length > 0) {
      setDuplicateBase(baseTitle);
      setDuplicateMatches(dbMatches);
      setDuplicateInList(inList);
      setDuplicateOpen(true);
      return;
    }
    addBookAndNext(raw);
  }, [editedTitle, confirmedBooks, currentCapture, addBookAndNext]);

  const handleRetake = useCallback(() => {
    setCurrentCapture(null);
    setEditedTitle("");
    setEditedCategoryId("");
    setCandidates([]);
    setPickedCandidateKey(null);
    lastDetectedRef.current = null;
    startCamera();
  }, [startCamera]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateOpen(false);
    setDuplicateMatches([]);
    setDuplicateInList([]);
    setDuplicateBase("");
    setCurrentCapture(null);
    setEditedTitle("");
    setEditedCategoryId("");
    setCandidates([]);
    setPickedCandidateKey(null);
    lastDetectedRef.current = null;
    startCamera();
  }, [startCamera]);

  const handleDuplicateNewCopy = useCallback(() => {
    const nextNum = duplicateMatches.length + duplicateInList.length + 1;
    const suffixed = `${duplicateBase} (${nextNum})`;
    setDuplicateOpen(false);
    setDuplicateMatches([]);
    setDuplicateInList([]);
    setDuplicateBase("");
    addBookAndNext(suffixed);
  }, [
    duplicateBase,
    duplicateMatches.length,
    duplicateInList.length,
    addBookAndNext,
  ]);

  const handleSubmit = useCallback(async () => {
    try {
      setNavigating(true);
      await submitAll();
    } catch (err) {
      console.error("[checkin] submit failed", err);
      setNavigating(false);
      alert(`入庫失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [submitAll]);

  const handleClose = useCallback(() => {
    setNavigating(true);
    stopStream();
    router.push("/admin");
  }, [router, stopStream]);

  // 確認彈窗預覽圖：相機模式用拍的照片，條碼模式用 Google 縮圖（沒有就空底）。
  const previewSrc = currentCapture
    ? currentCapture.imageDataUrl ?? currentCapture.remoteImageUrl
    : null;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        {mode === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-sm text-white/80">啟動相機中</p>
          </div>
        )}

        {(mode === "camera" ||
          mode === "processing" ||
          mode === "looking-up") && (
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
              <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6">
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
              <>
                <div className="absolute top-4 inset-x-0 flex flex-col items-center gap-3 z-10 px-6">
                  <p className="text-xs text-white/70 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full text-center max-w-[90%]">
                    對準 ISBN 條碼自動偵測，或按下方按鈕拍封面辨識 · {adminName || "—"}
                  </p>
                </div>
                <div className="absolute bottom-8 inset-x-0 flex flex-col items-center z-10 px-6">
                  <button
                    onClick={handleCapture}
                    aria-label="拍照"
                    className="w-[68px] h-[68px] rounded-full bg-white/10 backdrop-blur-md border-2 border-white/80 active:scale-95 transition flex items-center justify-center"
                  >
                    <span className="block w-[52px] h-[52px] rounded-full bg-white" />
                  </button>
                </div>
              </>
            )}
            {mode === "processing" && currentCapture?.imageDataUrl && (
              <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6">
                <ZoomableImage
                  src={currentCapture.imageDataUrl}
                  alt="captured"
                  className="w-36 h-48 object-cover rounded-lg mb-5 border border-white/10"
                />
                <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
                <p className="text-sm text-white/80">辨識中</p>
              </div>
            )}
            {mode === "looking-up" && currentCapture && (
              <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6">
                <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
                <p className="text-sm text-white/80">查詢中</p>
                <p className="text-xs text-white/40 mt-2 font-mono">
                  ISBN {currentCapture.pickedIsbn}
                </p>
              </div>
            )}
          </>
        )}

        {mode === "confirming" && currentCapture && (
          <div className="fixed inset-0 bg-black/50 flex items-end z-40">
            <div className="w-full bg-white text-neutral-900 rounded-t-3xl px-6 pt-6 pb-8 animate-slide-up max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-5" />
              <div className="flex gap-4 items-start">
                {previewSrc ? (
                  <ZoomableImage
                    src={previewSrc}
                    alt="cover"
                    className="w-20 h-28 object-cover rounded-md border border-neutral-200 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-28 rounded-md bg-neutral-100 flex items-center justify-center text-[10px] text-neutral-400 shrink-0">
                    無封面
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                      書名
                      {currentCapture.source === "barcode" && (
                        <span className="ml-1.5 inline-flex items-center text-[10px] text-neutral-400 font-normal">
                          · 來自條碼
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => {
                        setEditedTitle(e.target.value);
                        if (
                          currentCapture.source === "camera" &&
                          pickedCandidateKey
                        ) {
                          handleClearPickedCandidate();
                        }
                      }}
                      className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-base focus:outline-none focus:border-neutral-900 transition"
                      placeholder={
                        currentCapture.source === "barcode" &&
                        !currentCapture.detectedTitle
                          ? "Google 查無此 ISBN，請手動輸入書名"
                          : "輸入書名"
                      }
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                      分類
                      {currentCapture.suggestedCategoryId &&
                        editedCategoryId ===
                          currentCapture.suggestedCategoryId && (
                          <span className="ml-1.5 inline-flex items-center text-[10px] text-neutral-400 font-normal">
                            · AI 推薦
                          </span>
                        )}
                    </label>
                    <CategorySelect
                      value={editedCategoryId}
                      onChange={(e) => setEditedCategoryId(e.target.value)}
                      options={categoryOptions}
                      placeholder={
                        categoryOptions.length === 0
                          ? "尚無分類，請先至後台新增"
                          : "未分類"
                      }
                      disabled={categoryOptions.length === 0}
                    />
                  </div>
                </div>
              </div>

              {/* 條碼模式：顯示已自動帶入的 metadata；不需要候選清單 */}
              {currentCapture.source === "barcode" && (
                <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                  <p className="text-[11px] text-neutral-500 font-mono">
                    ISBN {currentCapture.pickedIsbn}
                  </p>
                  {(currentCapture.pickedAuthors ||
                    currentCapture.pickedPublisher) && (
                    <p className="text-xs text-neutral-700 mt-1">
                      {currentCapture.pickedAuthors ?? "—"}
                      {currentCapture.pickedPublisher
                        ? ` · ${currentCapture.pickedPublisher}`
                        : ""}
                      {currentCapture.pickedPublishedDate
                        ? ` · ${currentCapture.pickedPublishedDate.slice(0, 4)}`
                        : ""}
                    </p>
                  )}
                </div>
              )}

              {/* 相機模式：Google Books 候選清單 */}
              {currentCapture.source === "camera" && (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-neutral-500">
                      Google Books 比對
                      {candidatesLoading && (
                        <span className="ml-1.5 text-neutral-400 font-normal">
                          · 搜尋中
                        </span>
                      )}
                    </p>
                    {currentCapture.pickedIsbn && (
                      <button
                        type="button"
                        onClick={handleClearPickedCandidate}
                        className="text-[11px] text-neutral-400 hover:text-neutral-700 transition"
                      >
                        取消對應
                      </button>
                    )}
                  </div>

                  {currentCapture.pickedIsbn ? (
                    <div className="rounded-lg border border-neutral-900 bg-neutral-50 px-3 py-2.5">
                      <p className="text-[11px] text-neutral-500 font-mono">
                        ISBN {currentCapture.pickedIsbn}
                      </p>
                      {currentCapture.pickedAuthors && (
                        <p className="text-xs text-neutral-700 mt-0.5">
                          {currentCapture.pickedAuthors}
                          {currentCapture.pickedPublisher
                            ? ` · ${currentCapture.pickedPublisher}`
                            : ""}
                        </p>
                      )}
                    </div>
                  ) : candidates.length > 0 ? (
                    <ul className="space-y-2">
                      {candidates.map((c) => {
                        const key = c.isbn13 ?? c.isbn10 ?? c.title;
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => handlePickCandidate(c)}
                              className="w-full flex gap-3 items-start text-left rounded-lg border border-neutral-200 hover:border-neutral-900 px-3 py-2.5 transition"
                            >
                              {c.thumbnail ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={c.thumbnail}
                                  alt={c.title}
                                  className="w-10 h-14 object-cover rounded border border-neutral-100 shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-14 rounded bg-neutral-100 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-neutral-900 truncate">
                                  {c.title}
                                </p>
                                <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
                                  {c.authors.join("、") || "—"}
                                  {c.publishedDate
                                    ? ` · ${c.publishedDate.slice(0, 4)}`
                                    : ""}
                                </p>
                                {(c.isbn13 ?? c.isbn10) && (
                                  <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">
                                    ISBN {c.isbn13 ?? c.isbn10}
                                  </p>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-neutral-400 px-1">
                      {candidatesLoading
                        ? "搜尋中…"
                        : editedTitle.trim().length < 2
                          ? "輸入書名後會自動搜尋對應的 ISBN"
                          : "查無對應書目，可直接入庫（ISBN 留空）"}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleRetake}
                  className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
                >
                  {currentCapture.source === "barcode" ? "重掃" : "重拍"}
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
                >
                  加入入庫書單
                </button>
              </div>
            </div>
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
          全部入庫 ({totalCount})
          {totalCount > 0 && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-black/70"
              aria-hidden
            />
          )}
        </button>
      </footer>

      <BottomSheet
        open={duplicateOpen}
        onClose={handleDuplicateCancel}
        title="這本書好像已經存在"
        subtitle={
          duplicateInList.length > 0 && duplicateMatches.length > 0
            ? `館藏 ${duplicateMatches.length} 本、入庫清單 ${duplicateInList.length} 本`
            : duplicateInList.length > 0
              ? `入庫清單已有 ${duplicateInList.length} 本同名書`
              : `館藏已有 ${duplicateMatches.length} 本同名書`
        }
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
              新添購（序號{" "}
              {duplicateMatches.length + duplicateInList.length + 1}）
            </button>
          </div>
        }
      >
        {duplicateMatches.length > 0 && (
          <>
            <p className="text-xs text-neutral-500 mb-2">館藏中</p>
            <ul className="space-y-3 pb-2">
              {duplicateMatches.map((m) => (
                <li
                  key={m.book_id}
                  className="flex gap-3 items-start border border-neutral-100 rounded-xl p-3"
                >
                  {m.image_url ? (
                    <ZoomableImage
                      src={m.image_url}
                      alt={m.title}
                      className="w-14 h-20 object-cover rounded-md border border-neutral-100"
                    />
                  ) : (
                    <div className="w-14 h-20 rounded-md bg-neutral-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {m.title}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {m.book_id}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {new Date(m.checkin_time).toLocaleString("zh-TW")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {duplicateInList.length > 0 && (
          <>
            <p
              className={`text-xs text-neutral-500 mb-2 ${
                duplicateMatches.length > 0 ? "mt-4" : ""
              }`}
            >
              目前入庫清單中
            </p>
            <ul className="space-y-3 pb-2">
              {duplicateInList.map((b, idx) => {
                const inListPreview =
                  b.imageDataUrl ?? b.remoteImageUrl ?? "";
                return (
                  <li
                    key={`inlist-${idx}`}
                    className="flex gap-3 items-start border border-neutral-100 rounded-xl p-3"
                  >
                    {inListPreview ? (
                      <ZoomableImage
                        src={inListPreview}
                        alt={b.title}
                        className="w-14 h-20 object-cover rounded-md border border-neutral-100"
                      />
                    ) : (
                      <div className="w-14 h-20 rounded-md bg-neutral-100" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {b.title}
                      </p>
                      <p className="text-xs text-neutral-400 mt-1">
                        尚未送出入庫
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </BottomSheet>

      <BottomSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={`已掃 ${totalCount} 本書`}
        subtitle={adminName ? `負責人：${adminName}` : undefined}
        footer={
          <button
            onClick={handleSubmit}
            disabled={totalCount === 0 || submitting}
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-lg transition disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
          >
            {submitting ? "送出中…" : "完成入庫"}
          </button>
        }
      >
        {totalCount === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            尚未掃描任何書本
          </p>
        ) : (
          <ul className="space-y-3 pb-2">
            {confirmedBooks.map((b, idx) => {
              const categoryName = b.categoryId
                ? (categoryNameById.get(b.categoryId) ?? null)
                : null;
              const itemPreview = b.imageDataUrl ?? b.remoteImageUrl ?? "";
              return (
                <li
                  key={idx}
                  className="flex gap-3 items-center border border-neutral-100 rounded-xl p-3"
                >
                  {itemPreview ? (
                    <ZoomableImage
                      src={itemPreview}
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
                    <p className="text-xs text-neutral-400 mt-1">
                      #{idx + 1}
                      {b.isbn && (
                        <span className="ml-2 text-neutral-500 font-mono">
                          · ISBN {b.isbn}
                        </span>
                      )}
                      {categoryName && (
                        <span className="ml-2 text-neutral-500">
                          · {categoryName}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBookAt(idx)}
                    className="text-xs text-neutral-400 hover:text-red-500 transition"
                  >
                    移除
                  </button>
                </li>
              );
            })}
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
