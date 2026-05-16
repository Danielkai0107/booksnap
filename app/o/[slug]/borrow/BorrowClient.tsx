"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import BottomSheet from "@/components/BottomSheet";
import CameraErrorDialog from "@/components/CameraErrorDialog";
import { useToast } from "@/components/ToastProvider";
import { parseScannedQr } from "@/lib/publicScan";

type Sheet = "identify" | "profile" | "review" | "result" | null;

type BookInCart = {
  book_id: string;
  title: string;
  image_url: string | null;
  category_name: string | null;
};

type SubmitResult = {
  accepted: BookInCart[];
  rejected: Array<{ book_id: string; reason: string; title?: string }>;
};

type Props = {
  slug: string;
  orgName: string;
  /** Set when the reader landed via `/o/{slug}/b/{bookId}` from a QR scan. */
  prefillBookId: string | null;
};

/**
 * Public borrow workflow restructured around a check-in style camera canvas:
 *  - The camera fills the screen as soon as identity sheets close, and never
 *    has to be re-mounted between scans.
 *  - Phone + optional location are collected in the first BottomSheet so
 *    readers go through one less screen than the original wizard.
 *  - Profile (name + email + consent) opens after a successful phone lookup.
 *  - Scanned books pile up in an in-memory cart; the review sheet doubles as
 *    the "I'm done, submit" surface.
 */
export default function BorrowClient({ slug, orgName, prefillBookId }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [sheet, setSheet] = useState<Sheet>("identify");
  const [phone, setPhone] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [knownBorrowerId, setKnownBorrowerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [cart, setCart] = useState<BookInCart[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  /**
   * 掃到新書時暫存於此，等使用者按「加入清單」才真正進到 cart。
   * 不為 null 時 scan callback 透過 `scanningRef` 維持鎖定，
   * 避免同一本書被連續觸發、或下一本書直接覆蓋掉這次的確認。
   */
  const [pendingBook, setPendingBook] = useState<BookInCart | null>(null);
  /** True after `profile` is confirmed; camera should be live. */
  const [identified, setIdentified] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanningRef = useRef(false);
  const [cameraError, setCameraError] = useState(false);
  const [scanGen, setScanGen] = useState(0);

  // Mirror cart into a ref so the long-lived scan callback can see freshest
  // state without re-binding (re-binding kills the camera and re-prompts the
  // OS permission dialog on some browsers).
  const cartRef = useRef<BookInCart[]>([]);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  /**
   * 任何 BottomSheet（identify / profile / review / result / pendingBook）
   * 開啟時暫停掃描，避免使用者在看清單時不小心又掃到書本 QR、把確認彈窗
   * 推到清單上。用 ref 同步給 long-lived scan callback 讀。
   * `identify` / `profile` 階段相機其實還沒啟動（identified=false），但加進來
   * 也無害；主要關注的是 review / result / pendingBook 三種會疊在相機之上的彈窗。
   */
  const paused = sheet !== null || pendingBook !== null;
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

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
        category_name: string | null;
      };
      if (b.status !== "available") {
        return { error: "這本書目前已被借出" };
      }
      return {
        book_id: b.book_id,
        title: b.title,
        image_url: b.image_url,
        category_name: b.category_name,
      };
    },
    [slug],
  );

  // -- identify step --------------------------------------------------------
  async function handleIdentifyNext() {
    const trimmed = phone.trim();
    if (trimmed.replace(/\D+/g, "").length < 8) {
      toast.error("請輸入有效的手機號碼");
      return;
    }
    setLookupLoading(true);
    try {
      const res = await fetch("/api/public/borrowers/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, phone: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.borrower) {
        setKnownBorrowerId(data.borrower.id);
        setDisplayName(data.borrower.display_name);
        setEmail(data.borrower.email ?? "");
      } else {
        setKnownBorrowerId(null);
        setDisplayName("");
        setEmail("");
      }
      setSheet("profile");
    } catch (err) {
      console.error("[borrow] lookup failed", err);
      toast.error(err instanceof Error ? err.message : "查詢失敗");
    } finally {
      setLookupLoading(false);
    }
  }

  // -- profile step ---------------------------------------------------------
  async function handleProfileConfirm() {
    if (!displayName.trim()) {
      toast.error("請填寫姓名");
      return;
    }
    setIdentified(true);
    setSheet(null);

    // If the reader arrived via a deep-link, drop the book straight into the
    // cart so they don't need to re-scan the same QR they just opened.
    if (prefillBookId && cartRef.current.length === 0) {
      const r = await fetchBook(prefillBookId);
      if ("error" in r) {
        toast.error(r.error);
      } else {
        setCart([r]);
        toast.success(`已加入：${r.title}`);
      }
    }
  }

  // -- camera lifecycle (mirrors checkin/scan) ------------------------------
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
    if (!identified) return;
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
            // 清單/結果/確認彈窗任一開啟時暫停掃描；
            // 不設 scanningRef（讓清單關閉後立刻能重新掃），純粹忽略本次 result。
            if (pausedRef.current) return;
            if (scanningRef.current) return;
            scanningRef.current = true;
            // 任何「不需要等使用者決定」的退出路徑都走這個，
            // 給 700ms cooldown 避免相同 QR 連發；
            // 「掃到新書」的成功路徑走另一條，把鎖維持到使用者按下確認/取消。
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
                toast.error("這本書屬於其他單位，無法在此出借");
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
              // fetch 期間使用者可能已打開清單，再次檢查；
              // 如果暫停了就直接放棄這次結果，不要把確認彈窗壓到清單上面。
              if (pausedRef.current) {
                releaseAfterDelay();
                return;
              }
              // 掃到新書：不直接加入 cart，先丟到 pendingBook 等使用者確認。
              // `scanningRef` 維持 true，等 confirm/cancel 才釋放，這樣
              // 對著同一本書的鏡頭流不會持續觸發新確認。
              setPendingBook(r);
            } catch {
              // 防止意外（如 fetch throw）卡住鎖
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
        console.error("[borrow] camera init failed", err);
        if (!cancelled) setCameraError(true);
      }
    }

    void start();
    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [identified, scanGen, slug, toast, fetchBook, stopScanner]);

  function removeFromCart(bookId: string) {
    setCart((prev) => prev.filter((b) => b.book_id !== bookId));
  }

  // 兩個 handler 都需要釋放掃描鎖；用 700ms cooldown 給使用者
  // 把鏡頭移開那本書的時間，避免取消後立刻又跳回確認。
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
      const res = await fetch("/api/public/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          phone: phone.trim(),
          displayName: displayName.trim(),
          email: email.trim() || null,
          locationNote: locationNote.trim() || null,
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
      console.error("[borrow] submit failed", err);
      toast.error(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setResult(null);
    setCart([]);
    setLocationNote("");
    setKnownBorrowerId(null);
    setDisplayName("");
    setEmail("");
    setPhone("");
    setPendingBook(null);
    setIdentified(false);
    setSheet("identify");
  }

  function handleClose() {
    router.push(`/o/${encodeURIComponent(slug)}`);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black text-white flex flex-col">
      {/* camera canvas */}
      <div className="relative flex-1 overflow-hidden">
        {identified ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`focus-frame w-72 h-96 max-w-[78%] max-h-[58%] ${
                  paused ? "is-paused" : ""
                }`}
              >
                <span className="focus-bl" />
                <span className="focus-br" />
                <span className="scan-line" />
              </div>
            </div>
            <div className="absolute top-4 inset-x-0 flex flex-col items-center gap-3 z-10 px-6">
              <p className="text-xs text-white/70 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full text-center">
                對準書本 QR 自動加入 · {displayName || "—"}
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
          </>
        ) : (
          // Pre-identification idle state — show a soft loader behind the
          // sheets so users see something rather than a black void.
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <p className="text-sm text-white/70">
              請完成資料後開始掃書 · {orgName}
            </p>
          </div>
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
          disabled={!identified}
          className="relative h-9 inline-flex items-center bg-white hover:bg-neutral-100 disabled:bg-white/40 disabled:text-neutral-500 text-neutral-900 text-[13px] font-medium px-4 rounded-full transition"
        >
          完成出借 ({cart.length})
          {cart.length > 0 && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-black/70"
              aria-hidden
            />
          )}
        </button>
      </footer>

      {/* identify sheet --------------------------------------------------- */}
      <BottomSheet
        open={sheet === "identify"}
        onClose={handleClose}
        title="出借 · 識別資料"
        subtitle={orgName}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3.5 rounded-xl transition"
            >
              關閉
            </button>
            <button
              type="button"
              onClick={handleIdentifyNext}
              disabled={lookupLoading}
              className="flex-1 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-sm font-medium py-3.5 rounded-xl transition"
            >
              {lookupLoading ? "查詢中..." : "下一步"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <label className="block">
            <span className="text-xs text-neutral-500">手機號碼</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0912345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full px-4 py-3 border border-neutral-200 rounded-xl text-base focus:outline-none focus:border-neutral-900"
            />
            <span className="mt-1.5 block text-[11px] text-neutral-400">
              手機號碼是出借人的唯一識別，第二次出借直接帶入。
            </span>
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">使用地點（可選）</span>
            <input
              value={locationNote}
              onChange={(e) => setLocationNote(e.target.value)}
              placeholder="例如 203 班、辦公室"
              className="mt-1 w-full px-4 py-3 border border-neutral-200 rounded-xl text-base focus:outline-none focus:border-neutral-900"
            />
            <span className="mt-1.5 block text-[11px] text-neutral-400">
              讓下一個人能在公開查書頁看到這本書目前去了哪裡。
            </span>
          </label>
        </div>
      </BottomSheet>

      {/* profile sheet ---------------------------------------------------- */}
      <BottomSheet
        open={sheet === "profile"}
        onClose={() => setSheet("identify")}
        title="出借 · 確認資料"
        subtitle={
          knownBorrowerId
            ? "已有出借記錄，可直接確認或更新"
            : "首次出借，請填寫姓名"
        }
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSheet("identify")}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3.5 rounded-xl transition"
            >
              上一步
            </button>
            <button
              type="button"
              onClick={handleProfileConfirm}
              disabled={!displayName.trim()}
              className="flex-1 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-sm font-medium py-3.5 rounded-xl transition"
            >
              開始掃書
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <label className="block">
            <span className="text-xs text-neutral-500">姓名 / 暱稱</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full px-4 py-3 border border-neutral-200 rounded-xl text-base focus:outline-none focus:border-neutral-900"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">Email（可選）</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-4 py-3 border border-neutral-200 rounded-xl text-base focus:outline-none focus:border-neutral-900"
            />
          </label>
        </div>
      </BottomSheet>

      {/* review sheet ----------------------------------------------------- */}
      <BottomSheet
        open={sheet === "review"}
        onClose={() => setSheet(null)}
        title={`已掃 ${cart.length} 本書`}
        subtitle={
          locationNote
            ? `出借人 ${displayName} · 使用地點 ${locationNote}`
            : `出借人 ${displayName}`
        }
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
              {submitting ? "送出中…" : `確認出借 ${cart.length} 本`}
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
            {cart.map((b, idx) => (
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
                  <p className="text-xs text-neutral-400 mt-1">
                    #{idx + 1}
                    {b.category_name && (
                      <span className="ml-2 text-neutral-500">
                        · {b.category_name}
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
          掃到新書時的「加入清單」確認彈窗。受控於 `pendingBook`：
          打開期間 `scanningRef` 維持 true，所以下一個 QR 不會擠進來。 */}
      <BottomSheet
        open={pendingBook !== null}
        onClose={cancelPending}
        title="加入借閱清單？"
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
              {pendingBook.category_name && (
                <p className="text-xs text-neutral-500 mt-1">
                  {pendingBook.category_name}
                </p>
              )}
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
            ? `成功出借 ${result.accepted.length} 本`
            : "未借出任何書"
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
              再借一輪
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
                  以下書本未能出借：
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
    case "already_borrowed":
      return "已被借出";
    case "race_lost":
      return "幾乎同時有人借走了";
    default:
      return reason;
  }
}
