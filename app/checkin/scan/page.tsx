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

type Mode = "loading" | "camera" | "processing" | "confirming";

type CurrentCapture = {
  imageDataUrl: string;
  detectedTitle: string;
  suggestedCategoryId: string | null;
};

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

export default function CheckinScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
  const [editedIsbn, setEditedIsbn] = useState("");
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

  // Google 候選清單（debounce）。永遠顯示在 confirming 下半段。
  const [candidates, setCandidates] = useState<LookupCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<
    "rate_limited" | "failed" | null
  >(null);
  // 使用者點選的那一張卡片（含完整 metadata）；可被「再點另一張」覆寫。
  const [pickedCandidate, setPickedCandidate] =
    useState<LookupCandidate | null>(null);

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

  // 每次拍照後只查一次 Google Books（在 handleCapture 內呼叫），
  // 之後就算使用者編輯書名也不會再打 API，避免浪費 quota。
  const fetchCandidatesOnce = useCallback(async (rawTitle: string) => {
    const query = normalizeForGoogleSearch(rawTitle);
    if (query.length < 2) {
      setCandidates([]);
      setCandidatesError(null);
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
        setCandidatesError("failed");
        return;
      }
      const data = (await res.json()) as {
        candidates?: LookupCandidate[];
        error?: "rate_limited" | "failed" | null;
      };
      setCandidates(data.candidates?.slice(0, 5) ?? []);
      setCandidatesError(data.error ?? null);
    } catch (err) {
      console.warn("[checkin] lookup failed", err);
      setCandidates([]);
      setCandidatesError("failed");
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

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
    setCandidatesError(null);
    setPickedCandidate(null);
    setEditedIsbn("");
    setCurrentCapture({
      imageDataUrl: base64,
      detectedTitle: "",
      suggestedCategoryId: null,
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
        imageDataUrl: base64,
        detectedTitle: finalTitle,
        suggestedCategoryId: suggested?.id ?? null,
      });
      setEditedTitle(finalTitle);
      setEditedCategoryId(suggested?.id ?? "");
      setMode("confirming");
      // 一次性查詢 Google Books 候選清單。之後使用者編輯書名不會再觸發。
      void fetchCandidatesOnce(finalTitle);
    } catch (err) {
      console.error("recognize error", err);
      setCurrentCapture({
        imageDataUrl: base64,
        detectedTitle: "",
        suggestedCategoryId: null,
      });
      setEditedTitle("");
      setEditedCategoryId("");
      setMode("confirming");
    }
  }, [stopStream, categories, fetchCandidatesOnce]);

  const handlePickCandidate = useCallback((c: LookupCandidate) => {
    setPickedCandidate(c);
    setEditedTitle(c.title);
    setEditedIsbn(c.isbn13 ?? c.isbn10 ?? "");
  }, []);

  const handleUnpickCandidate = useCallback(() => {
    setPickedCandidate(null);
    setEditedIsbn("");
    // 回到當初 AI 辨識的書名（候選清單保留不動，使用者可以再選一張）。
    if (currentCapture) {
      setEditedTitle(currentCapture.detectedTitle);
    }
  }, [currentCapture]);

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
      setEditedTitle("");
      setEditedCategoryId("");
      setEditedIsbn("");
      setCandidates([]);
      setCandidatesError(null);
      setPickedCandidate(null);
      setToast({
        open: true,
        message: `已加入：${title}`,
        kind: "success",
      });
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

    const inList = confirmedBooks.filter((b) => {
      if (effectiveIsbn && b.isbn) return b.isbn === effectiveIsbn;
      return stripCopySuffix(b.title) === baseFromInput;
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
    setEditedTitle("");
    setEditedCategoryId("");
    setEditedIsbn("");
    setCandidates([]);
    setCandidatesError(null);
    setPickedCandidate(null);
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
    setEditedIsbn("");
    setCandidates([]);
    setCandidatesError(null);
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
      alert(`入庫失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [submitAll]);

  const handleClose = useCallback(() => {
    setNavigating(true);
    stopStream();
    router.push("/admin");
  }, [router, stopStream]);

  const pickedKey = pickedCandidate ? candidateKey(pickedCandidate) : null;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
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
                  <p className="text-xs text-white/70 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
                    對準書封拍照辨識 · {adminName || "—"}
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

        {mode === "confirming" && currentCapture && (
          <div className="fixed inset-0 bg-black/50 flex items-end z-40">
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
              </div>

              {/* 中間：候選結果區塊 — 標題列固定、清單可滾動 */}
              <div className="px-6 pt-3 pb-1 shrink-0 border-t border-neutral-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-500">
                    Google Books 比對結果
                    {candidatesLoading && (
                      <span className="ml-1.5 text-neutral-400 font-normal">
                        · 搜尋中
                      </span>
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
              <div className="flex-1 overflow-y-auto px-6 pt-2 pb-3 min-h-[80px] overscroll-contain">
                {candidates.length > 0 ? (
                  <ul className="space-y-2">
                    {candidates.map((c) => {
                      const key = candidateKey(c);
                      const selected = pickedKey === key;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => handlePickCandidate(c)}
                            className={`w-full flex gap-3 items-start text-left rounded-lg px-3 py-2.5 transition border-2 ${
                              selected
                                ? "border-neutral-900 bg-neutral-50"
                                : "border-neutral-200 hover:border-neutral-400"
                            }`}
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
                    {candidatesLoading
                      ? "搜尋中…"
                      : candidatesError === "rate_limited"
                        ? "Google Books 今日配額已用完，請手動輸入 ISBN 或直接入庫"
                        : candidatesError === "failed"
                          ? "比對服務暫時無回應，可直接入庫"
                          : "查無對應書目，可直接入庫（ISBN 留空或手動輸入）"}
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
                  b.remoteImageUrl ?? b.imageDataUrl ?? "";
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
