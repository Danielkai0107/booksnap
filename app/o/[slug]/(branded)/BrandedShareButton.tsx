"use client";

import { useToast } from "@/components/ToastProvider";

type Props = {
  orgName: string;
};

/**
 * Topbar 右側分享鈕：分享目前讀者頁網址（首頁、書籍查詢等）。
 * 支援 Web Share API；不支援時改複製連結。
 */
export default function BrandedShareButton({ orgName }: Props) {
  const toast = useToast();

  const handleShare = async () => {
    const url =
      typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;

    const payload = {
      url,
      title: orgName,
      text: `${orgName} — 掃描書本 QR 即可出借 / 歸還`,
    };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.warn("[BrandedShareButton] share failed", err);
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("已複製連結");
    } catch (err) {
      console.error("[BrandedShareButton] copy failed", err);
      toast.error("分享失敗，請手動複製網址");
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="分享此頁"
      className="press-feedback absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 transition"
      style={{ marginTop: "calc(env(safe-area-inset-top) / 2)" }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    </button>
  );
}
