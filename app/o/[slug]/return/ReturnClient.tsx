"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import BottomSheet from "@/components/BottomSheet";
import CameraErrorDialog from "@/components/CameraErrorDialog";
import { useToast } from "@/components/ToastProvider";
import { parseScannedQr } from "@/lib/publicScan";

type BookInCart = {
  book_id: string;
  title: string;
  image_url: string | null;
  current_holder: string | null;
  current_location: string | null;
};

type Sheet = "review" | "result" | null;

type Props = {
  slug: string;
  orgName: string;
  /** Set when the reader arrived via `/o/{slug}/b/{bookId}` deep link. */
  prefillBookId: string | null;
};

/**
 * Public return flow, restructured to mirror the check-in scanner:
 *  - The camera fills the screen the moment the page loads — no profile step
 *    because the borrower identity is recovered from `books.current_holder_id`.
 *  - Successful scans drop into an in-memory cart; the bottom footer button
 *    opens a BottomSheet to review + submit.
 *  - Org scope is enforced both client-side (QR slug must match) and on the
 *    server side via `/api/public/return`.
 */
export default function ReturnClient({ slug, orgName, prefillBookId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [cart, setCart] = useState<BookInCart[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    accepted: BookInCart[];
    rejected: Array<{ book_id: string; reason: string; title?: string }>;
  } | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  /**
   * 掃到新書時暫存於此，等使用者按「加入清單」才真正進到 cart。
   * 不為 null 時 scan callback 透過 `scanningRef` 維持鎖定，避免
   * 同一本書連續觸發、或下一本直接覆蓋掉本次確認。
   */
  const [pendingBook, setPendingBook] = useState<BookInCart | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanningRef = useRef(false);
  const [cameraError, setCameraError] = useState(false);
  const [scanGen, setScanGen] = useState(0);

  const cartRef = useRef<BookInCart[]>([]);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const fetchBook = useCallback(
    async (bookId: string): Promise<BookInCart | { error: string }> => {
      const res = await fetch(
        `/api/public/books?slug=${encodeURIComponent(slug)}&bookId=${encodeURIComponent(bookId)}`,
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { error: data?.error ?? "查無此書" };
      const b = data.book as {
        book_id: string;
        title: string;
        image_url: string | null;
        status: string;
        current_holder: string | null;
        current_location: string | null;
      };
      if (b.status !== "borrowed") {
        return { error: "這本書目前不在借出狀態" };
      }
      return {
        book_id: b.book_id,
        title: b.title,
        image_url: b.image_url,
        current_holder: b.current_holder,
        current_location: b.current_location,
      };
    },
    [slug],
  );

  // Prefill from deep link on first mount.
  useEffect(() => {
    if (!prefillBookId) return;
    (async () => {
      const r = await fetchBook(prefillBookId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setCart((prev) =>
        prev.find((b) => b.book_id === r.book_id) ? prev : [...prev, r],
      );
      toast.success(`已加入：${r.title}`);
    })();
    // Intentionally empty dep array: only run on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      try {
        const s = videoRef.current.srcObject as MediaStream;
        s.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCameraError(false);

    async function start() {
      try {
        if (!readerRef.current) {
          readerRef.current = new BrowserMultiFormatReader();
        }
        const reader = readerRef.current;
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          async (resultObj) => {
            if (!resultObj || cancelled) return;
            if (scanningRef.current) return;
            scanningRef.current = true;
            // 任何「不需要等使用者決定」的退出路徑都走這個，
            // 給 700ms cooldown 避免相同 QR 連發；
            // 「掃到新書」的成功路徑改走 pendingBook，鎖維持到 confirm/cancel。
            const releaseAfterDelay = () => {
              setTimeout(() => {
                scanningRef.current = false;
              }, 400);
            };
            try {
              const text = resultObj.getText();
              const parsed = parseScannedQr(text, slug);
              if (!parsed) {
                toast.error("無法解析此 QR");
                releaseAfterDelay();
                return;
              }
              if (parsed.slug && parsed.slug !== slug) {
                toast.error("這本書屬於其他單位，無法在此歸還");
                releaseAfterDelay();
                return;
              }
              const exists = cartRef.current.find(
                (b) => b.book_id === parsed.bookId,
              );
              if (exists) {
                toast.info(`已在清單中：${exists.title}`);
                releaseAfterDelay();
                return;
              }
              const r = await fetchBook(parsed.bookId);
              if ("error" in r) {
                toast.error(r.error);
                releaseAfterDelay();
                return;
              }
              // 掃到新書：丟到 pendingBook 等使用者確認，不直接 push 進 cart。
              setPendingBook(r);
            } catch {
              releaseAfterDelay();
            }
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (err) {
        console.error("[return] camera init failed", err);
        if (!cancelled) setCameraError(true);
      }
    }

    void start();
    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [scanGen, slug, toast, fetchBook, stopScanner]);

  function removeFromCart(bookId: string) {
    setCart((prev) => prev.filter((b) => b.book_id !== bookId));
  }

  // 兩個 handler 都需釋放掃描鎖；700ms cooldown 給使用者把鏡頭
  // 移開那本書的時間，避免取消後立刻又跳回確認。
  function confirmPending() {
    if (pendingBook) {
      setCart((prev) => [...prev, pendingBook]);
      toast.success(`已加入：${pendingBook.title}`);
    }
    setPendingBook(null);
    setTimeout(() => {
      scanningRef.current = false;
    }, 700);
  }
  function cancelPending() {
    setPendingBook(null);
    setTimeout(() => {
      scanningRef.current = false;
    }, 700);
  }

  async function handleSubmit() {
    if (cart.length === 0) {
      toast.error("還沒有掃到任何書");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          bookIds: cart.map((b) => b.book_id),
        }),
      });
      const data = await res.json();
      if (!res.ok && !data?.accepted) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const acceptedSet = new Set<string>(data.accepted ?? []);
      setResult({
        accepted: cart.filter((b) => acceptedSet.has(b.book_id)),
        rejected: data.rejected ?? [],
      });
      setSheet("result");
    } catch (err) {
      console.error("[return] submit failed", err);
      toast.error(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setResult(null);
    setCart([]);
    setSheet(null);
    setPendingBook(null);
    setScanGen((n) => n + 1);
  }

  function handleClose() {
    router.push(`/o/${encodeURIComponent(slug)}`);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black text-white flex flex-col">
      {/* camera canvas */}
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
          <p className="text-xs text-white/70 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full text-center">
            對準書本 QR 自動加入歸還清單 · {orgName}
          </p>
        </div>
        {cameraError && (
          <CameraErrorDialog
            onRetry={() => {
              setCameraError(false);
              setScanGen((n) => n + 1);
            }}
            onClose={handleClose}
          />
        )}
      </div>

      {/* footer with close + cart */}
      <footer className="flex items-center justify-between gap-3 px-4 pt-3 pb-6 bg-black/70 backdrop-blur-md z-20">
        <button
          type="button"
          onClick={handleClose}
          aria-label="關閉"
          className="w-9 h-9 rounded-full bg-white hover:bg-neutral-100 text-neutral-900 flex items-center justify-center transition"
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
          onClick={() => setSheet("review")}
          className="relative h-9 inline-flex items-center bg-white hover:bg-neutral-100 text-neutral-900 text-[13px] font-medium px-4 rounded-full transition"
        >
          完成歸還 ({cart.length})
          {cart.length > 0 && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-black/70"
              aria-hidden
            />
          )}
        </button>
      </footer>

      {/* review sheet ----------------------------------------------------- */}
      <BottomSheet
        open={sheet === "review"}
        onClose={() => setSheet(null)}
        title={`已掃 ${cart.length} 本書`}
        subtitle="檢查是否正確後送出歸還"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSheet(null)}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3.5 rounded-lg transition"
            >
              繼續掃描
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={cart.length === 0 || submitting}
              className="flex-1 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-sm font-medium py-3.5 rounded-lg transition"
            >
              {submitting ? "送出中…" : `確認歸還 ${cart.length} 本`}
            </button>
          </div>
        }
      >
        {cart.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            尚未掃描任何書本
          </p>
        ) : (
          <ul className="space-y-3 pb-2">
            {cart.map((b) => (
              <li
                key={b.book_id}
                className="flex gap-3 items-center border border-neutral-100 rounded-xl p-3"
              >
                {b.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
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
                  <p className="text-xs text-neutral-500 mt-1">
                    出借中：
                    <span className="text-neutral-900 font-medium">
                      {b.current_holder ?? "未知"}
                    </span>
                    {b.current_location && (
                      <span className="ml-1 text-neutral-400">
                        @ {b.current_location}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromCart(b.book_id)}
                  className="text-xs text-neutral-400 hover:text-red-500 transition"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>

      {/* confirm-pending sheet -------------------------------------------
          掃到新書時的「加入清單」確認彈窗。打開期間 `scanningRef`
          維持 true，所以下一個 QR 不會擠進來覆蓋本次確認。 */}
      <BottomSheet
        open={pendingBook !== null}
        onClose={cancelPending}
        title="加入歸還清單？"
        subtitle={orgName}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={cancelPending}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3.5 rounded-xl transition"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirmPending}
              className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-xl transition"
            >
              加入清單
            </button>
          </div>
        }
      >
        {pendingBook && (
          <div className="flex gap-3 items-center pb-2">
            {pendingBook.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pendingBook.image_url}
                alt={pendingBook.title}
                className="w-16 h-22 object-cover rounded-md border border-neutral-100"
              />
            ) : (
              <div className="w-16 h-22 rounded-md bg-neutral-100" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-neutral-900 leading-snug">
                {pendingBook.title}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                出借中：
                <span className="text-neutral-900 font-medium">
                  {pendingBook.current_holder ?? "未知"}
                </span>
                {pendingBook.current_location && (
                  <span className="ml-1 text-neutral-400">
                    @ {pendingBook.current_location}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* result sheet ----------------------------------------------------- */}
      <BottomSheet
        open={sheet === "result"}
        onClose={handleClose}
        title={
          result && result.accepted.length > 0
            ? `成功歸還 ${result.accepted.length} 本`
            : "未歸還任何書"
        }
        subtitle={orgName}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3.5 rounded-lg transition"
            >
              完成
            </button>
            <button
              type="button"
              onClick={startOver}
              className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-lg transition"
            >
              再還一輪
            </button>
          </div>
        }
      >
        {result && (
          <div className="pb-2">
            {result.accepted.length > 0 && (
              <ul className="space-y-2">
                {result.accepted.map((b) => (
                  <li
                    key={b.book_id}
                    className="px-3 py-2.5 bg-neutral-50 border border-neutral-100 rounded-xl text-sm text-neutral-900 truncate"
                  >
                    {b.title}
                  </li>
                ))}
              </ul>
            )}
            {result.rejected.length > 0 && (
              <div className={result.accepted.length > 0 ? "mt-4" : ""}>
                <p className="text-xs text-amber-700 mb-2">
                  以下書本未能歸還：
                </p>
                <ul className="space-y-2">
                  {result.rejected.map((r) => (
                    <li
                      key={r.book_id}
                      className="px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800"
                    >
                      {r.title ?? r.book_id} · {humanReason(r.reason)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function humanReason(reason: string): string {
  switch (reason) {
    case "not_found":
      return "查無此書";
    case "not_borrowed":
      return "目前不在借出狀態";
    case "race_lost":
      return "幾乎同時被處理了";
    default:
      return reason;
  }
}
