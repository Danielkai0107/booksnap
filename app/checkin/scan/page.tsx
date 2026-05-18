"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recognizeBookCover } from "@/lib/ocr";
import { type CategoryRow } from "@/lib/supabase";
import {
  isSameBookTitle,
  isbnVariants,
  normalizeForGoogleSearch,
  stripCopySuffix,
} from "@/lib/titleMatch";
import { compressImageDataUrl } from "@/lib/imageCompress";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { useCheckinCart, type ConfirmedBook } from "@/lib/useCheckinCart";
import type { LookupCandidate } from "@/app/api/books/lookup/route";
import BottomSheet from "@/components/BottomSheet";
import CameraErrorDialog from "@/components/CameraErrorDialog";
import CategorySelect from "@/components/CategorySelect";
import DocumentCornerAdjuster from "@/components/DocumentCornerAdjuster";
import { useToast } from "@/components/ToastProvider";
import ZoomableImage from "@/components/ZoomableImage";
import { loadJscanify, type Corners, type Jscanify } from "@/lib/jscanify";
import {
  detectCornersFromCanvas,
  extractPaperDataUrl,
} from "@/lib/cornerDetect";

type Mode = "loading" | "camera" | "processing" | "adjusting" | "confirming";

type CurrentCapture = {
  imageDataUrl: string;
  detectedTitle: string;
  suggestedCategoryId: string | null;
};

/**
 * 智能辨識本期剩餘次數，由 /api/recognize 每次回傳；初始 null = 尚未發過任何
 * 一次 OCR。確認彈窗下方會顯示「智能辨識剩餘次數：N」灰字；達 0 後再拍照
 * 會被伺服器跳過 Claude 呼叫，直接帶空書名進來。
 */

type DuplicateMatch = {
  book_id: string;
  title: string;
  image_url: string | null;
  checkin_time: string;
  status: string;
  current_holder: string | null;
};

function candidateKey(c: LookupCandidate): string {
  return c.isbn13 ?? c.isbn10 ?? c.title;
}

type PendingCapture = {
  rawDataUrl: string;
  width: number;
  height: number;
  detectedCorners: Corners | null;
};

export default function CheckinScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<Jscanify | null>(null);
  // 用 state 而不是 ref 來追蹤 scanner 載入狀態，這樣 UI 才會 re-render
  // 顯示 / 隱藏「智慧校正準備中」。
  const [scannerReady, setScannerReady] = useState(false);
  const [scannerFailed, setScannerFailed] = useState(false);

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
  // 相機快門按下後、進入 adjusting 前需要保留的原始 frame。
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(
    null,
  );
  const [editedTitle, setEditedTitle] = useState("");
  const [editedCategoryId, setEditedCategoryId] = useState<string>("");
  const [editedIsbn, setEditedIsbn] = useState("");
  /** 是否處於相機初始化失敗狀態（顯示重試對話框） */
  const [cameraError, setCameraError] = useState(false);
  const toast = useToast();

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

  // Google 候選清單（debounce）。永遠顯示在 confirming 下半段。
  const [candidates, setCandidates] = useState<LookupCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  // 使用者點選的那一張卡片（含完整 metadata）；可被「再點另一張」覆寫。
  const [pickedCandidate, setPickedCandidate] =
    useState<LookupCandidate | null>(null);

  // 智能辨識本期剩餘次數。初始從 /api/me 撈一次，之後每次 /api/recognize 回傳
  // 都會更新；達 0 後伺服器會跳過 Claude 呼叫，前端只是純顯示。
  const [aiRemaining, setAiRemaining] = useState<number | null>(null);

  // 重複偵測：分為「館藏中已有」與「目前清單中已有」兩段，序號要兩者一起算。
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>(
    [],
  );
  const [duplicateInList, setDuplicateInList] = useState<ConfirmedBook[]>([]);
  const [duplicateBase, setDuplicateBase] = useState("");

  const [listOpen, setListOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);

  // 相機開啟進度（0–100）。配合 mode === "loading" 的「準備中 NN%」顯示，
  // 純為 UX 感官，並不是真的精準進度——基線會隨時間自己 ease 上去 70%，
  // 各個 milestone 會把上限往上頂；給使用者「在動」的感覺。
  const [prepPercent, setPrepPercent] = useState(0);
  const prepTargetRef = useRef(0);
  const bumpPrep = useCallback((target: number) => {
    const clamped = Math.max(0, Math.min(100, target));
    if (clamped > prepTargetRef.current) prepTargetRef.current = clamped;
  }, []);
  // 鍵盤打開時把 confirming sheet 往上推（避開 iOS 上的 fixed inset-0 鍵盤遮擋問題）
  const keyboardInset = useKeyboardInset(mode === "confirming");

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
    setCameraError(false);
    // 重置進度後切回 "loading"，讓「準備中 NN%」從 0 開始播。
    // 對「重拍」這種已有授權的情境，整段 loading 很短，但保留動畫一致性。
    setPrepPercent(0);
    prepTargetRef.current = 0;
    setMode("loading");
    bumpPrep(25);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      bumpPrep(60);
      // video element 在 "loading" mode 就已經 mount（見下方 JSX），
      // 所以這裡 attach 一定拿得到 ref，不用等 mode 切換。
      await attachStreamToVideo();
      bumpPrep(95);
      setMode("camera");
    } catch (err) {
      // 詳細錯誤只給 dev 排查，UI 顯示友善訊息 + 重新請求按鈕。
      console.error("[scan] camera init failed", err);
      // 明確把 streamRef 清掉，建立「cameraError=true ⇒ 無 stream」的不變式，
      // 之後 render 就只需檢查 `cameraError`，不必讀 ref（React 19 不允許）。
      streamRef.current = null;
      bumpPrep(100);
      setCameraError(true);
      setMode("camera");
    }
  }, [attachStreamToVideo, bumpPrep]);

  useEffect(() => {
    if (!adminName) return;
    startCamera();
    return () => {
      stopStream();
    };
  }, [adminName, startCamera, stopStream]);

  // 在 loading 期間以 ~16fps 把 prepPercent 朝「target」貼合。
  // baseline = 70%（asymptotic ~1.1s 充滿七成），確保即使外部 milestone
  // 沒更新進度條也會自己慢慢往上爬，不會卡死讓使用者覺得當機。
  useEffect(() => {
    if (mode !== "loading") return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const baseline = Math.round(70 * (1 - Math.exp(-elapsed / 1100)));
      const target = Math.max(prepTargetRef.current, baseline);
      setPrepPercent((p) => {
        if (p >= target) return p;
        const step = Math.max(1, Math.ceil((target - p) * 0.2));
        return Math.min(target, p + step);
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (mode === "camera" && streamRef.current) {
      void attachStreamToVideo();
    }
  }, [mode, attachStreamToVideo]);

  // 第一次進入拍照頁就背景載入 jscanify + OpenCV.js。失敗就降級成原本
  // 的「raw 拍照直接送 Claude」流程，使用者無感（沒有錯誤 toast，避免
  // 干擾正常入庫節奏）。
  useEffect(() => {
    let alive = true;
    loadJscanify()
      .then((j) => {
        if (!alive) return;
        scannerRef.current = j;
        setScannerReady(true);
      })
      .catch((err) => {
        console.warn("[scan] jscanify load failed, fallback to raw flow", err);
        if (!alive) return;
        scannerRef.current = null;
        setScannerFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 每次拍照後只查一次 Google Books（在 handleCapture 內呼叫），
  // 之後就算使用者編輯書名也不會再打 API，避免浪費 quota。
  const fetchCandidatesOnce = useCallback(async (rawTitle: string) => {
    const query = normalizeForGoogleSearch(rawTitle);
    if (query.length < 2) {
      setCandidates([]);
      setCandidatesLoading(false);
      return;
    }
    setCandidatesLoading(true);
    try {
      const res = await fetch(
        `/api/books/lookup?title=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setCandidates([]);
        return;
      }
      const data = (await res.json()) as {
        candidates?: LookupCandidate[];
      };
      setCandidates(data.candidates?.slice(0, 5) ?? []);
      // 所有 lookup 失敗（rate_limited / 5xx / 網路）一律不彈 toast，
      // sheet 內固定顯示「暫無搜尋結果，可直接入庫」就好。對使用者來說
      // 都是不可操作事件，quota 監控請看 server log 或 GCP console。
    } catch (err) {
      console.warn("[checkin] lookup failed", err);
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  /**
   * 把校正後（或 raw fallback）的圖丟給 Claude 辨識，並打開確認 sheet。
   * 從原本 handleCapture 拆出來，方便 adjusting → 套用 → 直接 reuse。
   */
  const runRecognition = useCallback(
    async (dataUrl: string) => {
      // 壓縮給 OCR（省 Claude tokens）也順便當儲存圖檔，省 Supabase storage。
      const compressed = await compressImageDataUrl(dataUrl, {
        maxDimension: 768,
        quality: 0.85,
      });
      setMode("processing");
      setCandidates([]);
      setPickedCandidate(null);
      setEditedIsbn("");
      setCurrentCapture({
        imageDataUrl: compressed,
        detectedTitle: "",
        suggestedCategoryId: null,
      });

      try {
        const categoryNames = categories.map((c) => c.name);
        const { title, category, remaining, skipped } =
          await recognizeBookCover(compressed, categoryNames);
        // 不管是辨識成功還是被伺服器跳過，remaining 都會更新；只有網路錯誤才會
        // 是 null，這時保留前一次的值，UI 也只是不更新而已。
        if (typeof remaining === "number") setAiRemaining(remaining);
        // skipped = true 時 title 一定是空字串，這裡直接讓使用者手動輸入；
        // 流程不彈額外通知（依需求設計，UI 只剩下方剩餘次數灰字 = 0 暗示）。
        const finalTitle = skipped ? "" : (title?.trim() ?? "");
        const suggested = category
          ? (categories.find((c) => c.name === category) ?? null)
          : null;
        setCurrentCapture({
          imageDataUrl: compressed,
          detectedTitle: finalTitle,
          suggestedCategoryId: suggested?.id ?? null,
        });
        setEditedTitle(finalTitle);
        setEditedCategoryId(suggested?.id ?? "");
        setMode("confirming");
        // 跳過辨識時不查 Google Books（沒書名就查不到東西，省一次 API quota）。
        if (!skipped && finalTitle) {
          void fetchCandidatesOnce(finalTitle);
        } else {
          setCandidates([]);
          setCandidatesLoading(false);
        }
      } catch (err) {
        console.error("recognize error", err);
        setCurrentCapture({
          imageDataUrl: compressed,
          detectedTitle: "",
          suggestedCategoryId: null,
        });
        setEditedTitle("");
        setEditedCategoryId("");
        setMode("confirming");
      }
    },
    [categories, fetchCandidatesOnce],
  );

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      toast.error("相機尚未就緒，請稍候再試");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const rawDataUrl = canvas.toDataURL("image/jpeg", 0.95);

    stopStream();

    // 沒 scanner（CDN 載入失敗或還沒 ready）就直接送 Claude，
    // 避免使用者卡在「智慧校正準備中」。
    const j = scannerRef.current;
    if (!j) {
      void runRecognition(rawDataUrl);
      return;
    }

    // 用全解析度 frame 偵測一次，只當作 adjuster 的初始 hint；
    // 不再做信心判斷 / 自動 extract（會讓使用者覺得「沒得選」），
    // 一律進手動調整流程。
    const detected = detectCornersFromCanvas(canvas, j.cv);
    setPendingCapture({
      rawDataUrl,
      width: canvas.width,
      height: canvas.height,
      detectedCorners: detected,
    });
    setMode("adjusting");
  }, [stopStream, runRecognition, toast]);

  const handleAdjusterConfirm = useCallback(
    async (corners: Corners) => {
      const pc = pendingCapture;
      const j = scannerRef.current;
      if (!pc) return;
      // 走到 adjusting 表示 scanner 一定 ready（否則 handleCapture 早就
      // fallback 走 runRecognition 了），但 defensive check 比較安全。
      if (!j) {
        void runRecognition(pc.rawDataUrl);
        return;
      }
      const img = await loadImage(pc.rawDataUrl);
      const extracted = extractPaperDataUrl(img, corners, j.scanner);
      if (!extracted) {
        toast.error("校正失敗，請重新調整或重拍");
        return;
      }
      // 套用即送出：拉正後直接進辨識，不再多一層預覽確認。
      void runRecognition(extracted);
    },
    [pendingCapture, runRecognition, toast],
  );

  const handleAdjusterCancel = useCallback(() => {
    setPendingCapture(null);
    startCamera();
  }, [startCamera]);

  const handleUnpickCandidate = useCallback(() => {
    setPickedCandidate(null);
    setEditedIsbn("");
    // 回到當初 AI 辨識的書名（候選清單保留不動，使用者可以再選一張）。
    if (currentCapture) {
      setEditedTitle(currentCapture.detectedTitle);
    }
  }, [currentCapture]);

  const handlePickCandidate = useCallback(
    (c: LookupCandidate) => {
      // 點同一張卡片視為取消選取（toggle）。
      const isSame =
        pickedCandidate && candidateKey(pickedCandidate) === candidateKey(c);
      if (isSame) {
        handleUnpickCandidate();
        return;
      }
      setPickedCandidate(c);
      setEditedTitle(c.title);
      setEditedIsbn(c.isbn13 ?? c.isbn10 ?? "");
    },
    [pickedCandidate, handleUnpickCandidate],
  );

  // 確認彈窗最終要送出的 ISBN：直接信任使用者在 input 內看到的值。
  const effectiveIsbn = useMemo(
    () => editedIsbn.trim().replace(/[-\s]/g, "") || null,
    [editedIsbn],
  );

  // 封面預覽：選到候選且 Google 有圖就用 Google 縮圖，否則用拍照。
  const previewSrc =
    pickedCandidate?.thumbnail ?? currentCapture?.imageDataUrl ?? null;

  const addBookAndNext = useCallback(
    (title: string) => {
      if (!currentCapture) return;
      cartAddBook({
        title,
        imageDataUrl: currentCapture.imageDataUrl,
        // 有 Google 封面 -> 寫入 remoteImageUrl，後端會優先採用。
        remoteImageUrl: pickedCandidate?.thumbnail ?? null,
        categoryId: editedCategoryId || null,
        isbn: effectiveIsbn,
        authors:
          pickedCandidate && pickedCandidate.authors.length > 0
            ? pickedCandidate.authors.join("、")
            : null,
        publisher: pickedCandidate?.publisher ?? null,
        publishedDate: pickedCandidate?.publishedDate ?? null,
      });
      setCurrentCapture(null);
      setPendingCapture(null);
      setEditedTitle("");
      setEditedCategoryId("");
      setEditedIsbn("");
      setCandidates([]);
      setPickedCandidate(null);
      toast.success(`已加入：${title}`);
      startCamera();
    },
    [
      cartAddBook,
      currentCapture,
      editedCategoryId,
      effectiveIsbn,
      pickedCandidate,
      startCamera,
    ],
  );

  const handleConfirm = useCallback(async () => {
    if (!currentCapture) return;
    const raw = editedTitle.trim() || "未命名書籍";
    const baseFromInput = stripCopySuffix(raw);

    // 入庫清單去重複：
    //  - 兩邊都有 ISBN：用 10/13 變體比對，避免館藏存 10 碼、輸入是 13 碼。
    //  - 任一邊缺 ISBN：退回書名比對（normalize + coreTitle + 雙向包含）。
    const isbnSet = effectiveIsbn
      ? new Set(isbnVariants(effectiveIsbn))
      : null;
    const inList = confirmedBooks.filter((b) => {
      if (isbnSet && b.isbn) return isbnSet.has(b.isbn);
      return isSameBookTitle(baseFromInput, b.title);
    });

    let dbMatches: DuplicateMatch[] = [];
    let baseTitle = baseFromInput;
    try {
      const params = new URLSearchParams();
      if (effectiveIsbn) params.set("isbn", effectiveIsbn);
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
  }, [
    editedTitle,
    confirmedBooks,
    currentCapture,
    effectiveIsbn,
    addBookAndNext,
  ]);

  const handleRetake = useCallback(() => {
    setCurrentCapture(null);
    setPendingCapture(null);
    setEditedTitle("");
    setEditedCategoryId("");
    setEditedIsbn("");
    setCandidates([]);
    setPickedCandidate(null);
    startCamera();
  }, [startCamera]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateOpen(false);
    setDuplicateMatches([]);
    setDuplicateInList([]);
    setDuplicateBase("");
    setCurrentCapture(null);
    setPendingCapture(null);
    setEditedTitle("");
    setEditedCategoryId("");
    setEditedIsbn("");
    setCandidates([]);
    setPickedCandidate(null);
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
      toast.error("入庫失敗，請稍後再試");
    }
  }, [submitAll, toast]);

  const handleClose = useCallback(() => {
    setNavigating(true);
    stopStream();
    router.push("/");
  }, [router, stopStream]);

  const pickedKey = pickedCandidate ? candidateKey(pickedCandidate) : null;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        {/* video 元素要在 loading 階段就 mount，attachStreamToVideo 才能拿到
            videoRef。loading overlay 用 z-20 蓋在上面，視覺上仍是黑色等待畫面。 */}
        {(mode === "loading" || mode === "camera" || mode === "processing") && (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {mode === "loading" && (
          <div className="absolute inset-0 z-20 bg-black flex flex-col items-center justify-center text-center px-6">
            {/* w-9 對齊整站 fullscreen loader（app/loading.tsx、CheckinEntryClient、
                AdminShell 第一次載入），切頁時就不會看到 spinner 尺寸跳動。 */}
            <div className="w-9 h-9 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-sm text-white/80 mb-1">啟動相機中</p>
            <p className="text-xs text-white/55 tabular-nums">
              準備中 {Math.round(prepPercent)}%
            </p>
          </div>
        )}

        {(mode === "camera" || mode === "processing") && (
          <>
            {/* 不做即時 highlight：避免四角持續變形讓使用者抓不準時機；
                校正全部交給拍完後的手動四點調整 sheet。 */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="focus-frame w-60 h-80 max-w-[64%] max-h-[48%]">
                <span className="focus-bl" />
                <span className="focus-br" />
              </div>
            </div>
            {cameraError && (
              <CameraErrorDialog
                onRetry={() => startCamera()}
                onClose={() => {
                  stopStream();
                  router.push("/");
                }}
              />
            )}
            {mode === "camera" && !cameraError && (
              <>
                <div className="absolute top-4 inset-x-0 flex flex-col items-center gap-2 z-10 px-6">
                  <p className="text-xs text-white/70 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
                    {adminName || "—"}
                  </p>
                  <p className="text-[11px] text-white/65 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full">
                    請確保背景乾淨，邊緣才好辨識
                  </p>
                  {!scannerReady && !scannerFailed && (
                    <p className="text-[11px] text-white/60 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full">
                      智慧校正準備中…
                    </p>
                  )}
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
            {mode === "processing" && currentCapture && (
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
          </>
        )}

        {mode === "adjusting" && pendingCapture && (
          <DocumentCornerAdjuster
            imageDataUrl={pendingCapture.rawDataUrl}
            imageWidth={pendingCapture.width}
            imageHeight={pendingCapture.height}
            initialCorners={pendingCapture.detectedCorners}
            onCancel={handleAdjusterCancel}
            onConfirm={handleAdjusterConfirm}
          />
        )}

        {mode === "confirming" && currentCapture && (
          <div
            className="fixed inset-0 bg-black/50 flex items-end z-40"
            style={{
              paddingBottom: keyboardInset,
              transition: "padding-bottom 200ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div className="w-full bg-white text-neutral-900 rounded-t-3xl animate-slide-up shadow-2xl flex flex-col max-h-[90vh]">
              <div className="pt-3 pb-1 flex justify-center shrink-0">
                <span className="w-10 h-1 bg-neutral-200 rounded-full" />
              </div>

              {/* 上半：固定不滾動 — 封面 + 書名 / 分類 / ISBN */}
              <div className="px-6 pt-3 pb-4 shrink-0">
                <div className="flex gap-4 items-start">
                  {previewSrc ? (
                    <ZoomableImage
                      key={previewSrc}
                      src={previewSrc}
                      alt="cover"
                      className="w-20 h-28 object-cover rounded-md border border-neutral-200 shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-28 rounded-md bg-neutral-100 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                        書名
                      </label>
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-base focus:outline-none focus:border-neutral-900 transition"
                        placeholder="輸入書名"
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
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                        ISBN
                        <span className="ml-1.5 inline-flex items-center text-[10px] text-neutral-400 font-normal">
                          {pickedCandidate ? "· 來自比對結果" : "· 選填"}
                        </span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editedIsbn}
                        onChange={(e) => setEditedIsbn(e.target.value)}
                        placeholder="例：9789861371955"
                        className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm font-mono tabular-nums focus:outline-none focus:border-neutral-900 transition"
                      />
                    </div>
                  </div>
                </div>
                {/* 智能辨識剩餘次數：純資訊提示，0 次時不彈通知、不擋功能，
                    僅本次 / 之後拍照會跳過 Claude 呼叫直接帶空書名進來。 */}
                {typeof aiRemaining === "number" && (
                  <p className="mt-3 text-[11px] text-neutral-400">
                    智能辨識剩餘次數：{aiRemaining.toLocaleString()}
                  </p>
                )}
              </div>

              {/* 中間：候選結果區塊 — 標題列固定、清單可滾動 */}
              <div className="px-6 pt-3 pb-1 shrink-0 border-t border-neutral-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-500 inline-flex items-center gap-1.5">
                    <span>Google Books 搜尋 · 點擊下方直接帶入資料</span>
                    {candidatesLoading && (
                      <span
                        aria-hidden
                        className="w-3 h-3 border-2 border-neutral-200 border-t-neutral-700 rounded-full animate-spin"
                      />
                    )}
                  </p>
                  {pickedCandidate && (
                    <button
                      type="button"
                      onClick={handleUnpickCandidate}
                      className="text-[11px] text-neutral-400 hover:text-neutral-700 transition"
                    >
                      取消選取
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pt-2 pb-3 min-h-[80px] overscroll-contain scroll-thin">
                {candidatesLoading && candidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <div className="w-6 h-6 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
                    <p className="text-[11px] text-neutral-400">
                      搜尋 Google Books 中…
                    </p>
                  </div>
                ) : candidates.length > 0 ? (
                  <ul className="space-y-2">
                    {candidates.map((c) => {
                      const key = candidateKey(c);
                      const selected = pickedKey === key;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => handlePickCandidate(c)}
                            className={`w-full flex gap-3 items-start text-left rounded-lg px-3 py-2.5 transition border ${
                              selected
                                ? "border-neutral-900 bg-neutral-50"
                                : "border-neutral-100 hover:border-neutral-300"
                            }`}
                          >
                            {c.thumbnail ? (
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
                            {selected && (
                              <span
                                aria-hidden
                                className="w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center shrink-0 mt-1"
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                >
                                  <path
                                    d="M2 6.5L5 9.5L10 3"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[11px] text-neutral-400 px-1 py-2">
                    暫無搜尋結果，可直接入庫
                  </p>
                )}
              </div>

              {/* 下半：固定按鈕區 */}
              <div className="px-6 pt-3 pb-8 border-t border-neutral-100 shrink-0">
                <div className="flex gap-3">
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
                    加入入庫書單
                  </button>
                </div>
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
                    <p className="text-xs text-neutral-500 mt-1">{m.book_id}</p>
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
                const inListPreview = b.remoteImageUrl ?? b.imageDataUrl ?? "";
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
          <div className="flex gap-3">
            <button
              onClick={() => setListOpen(false)}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3.5 rounded-lg transition"
            >
              繼續加入
            </button>
            <button
              onClick={handleSubmit}
              disabled={totalCount === 0 || submitting}
              className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-lg transition disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
            >
              {submitting ? "送出中…" : "完成入庫"}
            </button>
          </div>
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
              const itemPreview = b.remoteImageUrl ?? b.imageDataUrl ?? "";
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

      {navigating && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <div className="w-9 h-9 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
