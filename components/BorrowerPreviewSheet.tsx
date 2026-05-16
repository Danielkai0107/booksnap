"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomSheet from "./BottomSheet";
import { useToast } from "./ToastProvider";
import { maskPhoneAdmin } from "@/lib/mask";

type BorrowerData = {
  borrower: {
    id: string;
    phone: string;
    display_name: string;
    email: string | null;
    last_active_at: string | null;
    created_at: string;
  };
  holding: Array<{
    book_id: string;
    title: string;
    image_url: string | null;
    current_location: string | null;
  }>;
  records: Array<{
    borrowed_at: string;
    returned_at: string | null;
  }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Borrower id to preview; null skips fetching. */
  borrowerId: string | null;
  /** Optional deep link; usually `/admin/borrowers/{id}`. */
  detailHref?: string;
};

/**
 * Bottom-sheet preview for a single borrower. Shares the same shape as the
 * full `/admin/borrowers/[id]` page so admins can peek without navigating
 * away from a book detail or borrow record.
 */
export default function BorrowerPreviewSheet({
  open,
  onClose,
  borrowerId,
  detailHref,
}: Props) {
  const [data, setData] = useState<BorrowerData | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open || !borrowerId) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/borrowers/${encodeURIComponent(borrowerId)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setData(json as BorrowerData);
      } catch (err) {
        if (!alive) return;
        console.error("[borrower-preview] fetch failed", err);
        toast.error("載入出借人資料失敗");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, borrowerId, toast]);

  const lastAction = data?.records?.[0] ?? null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="出借人資訊"
      subtitle={data?.borrower.display_name ?? undefined}
      footer={
        detailHref ? (
          <Link
            href={detailHref}
            onClick={onClose}
            className="press-feedback block w-full text-center bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg"
          >
            查看完整資料
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
          >
            關閉
          </button>
        )
      }
    >
      {loading ? (
        <div className="py-10 flex justify-center">
          <div className="w-6 h-6 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : data ? (
        <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-4 md:p-5 mb-2">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-neutral-900">
              {data.borrower.display_name}
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              手機 · {maskPhoneAdmin(data.borrower.phone)}
            </p>
            {data.borrower.email && (
              <p className="text-xs text-neutral-500">
                Email · {data.borrower.email}
              </p>
            )}
            {lastAction && (
              <p className="mt-1 text-xs text-neutral-500">
                最近動作 ·{" "}
                {lastAction.returned_at
                  ? `${new Date(lastAction.returned_at).toLocaleString("zh-TW")} 歸還`
                  : `${new Date(lastAction.borrowed_at).toLocaleString("zh-TW")} 借出`}
              </p>
            )}
          </div>

          <div className="mt-4">
            <p className="text-[18px] font-bold text-neutral-900 mb-3">
              目前持有 {data.holding.length} 本
            </p>
            {data.holding.length === 0 ? (
              <p className="text-sm text-neutral-400">無持有書本</p>
            ) : (
              <ul className="flex gap-3 overflow-x-auto pb-1">
                {data.holding.map((b) => (
                  <li key={b.book_id} className="shrink-0 w-16">
                    {b.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.image_url}
                        alt={b.title}
                        className="w-16 h-16 object-cover rounded-md border border-neutral-200"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-md bg-white border border-neutral-200 flex items-center justify-center text-[10px] text-neutral-400">
                        無圖
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-neutral-700 line-clamp-2 leading-tight">
                      {b.title}
                    </p>
                    {b.current_location && (
                      <p className="text-[10px] text-neutral-400 truncate">
                        {b.current_location}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </BottomSheet>
  );
}
