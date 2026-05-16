"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomSheet from "./BottomSheet";

type MemberData = {
  member: { name: string; created_at: string };
  holding: Array<{
    book_id: string;
    title: string;
    image_url: string | null;
  }>;
  records: Array<{
    borrowed_at: string;
    returned_at: string | null;
  }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** 預覽對象的成員名稱；null 時不會 fetch。 */
  name: string | null;
  /** 「查看完整成員」連結（後台用 /admin/members/[name]、前台用 /members/[name]）。 */
  detailHref?: string;
};

/**
 * Shared member preview sheet. Displays the same detail card layout used on
 * /members/[name] inside a bottom sheet, so book pages can peek at a borrower
 * without navigating away.
 */
export default function MemberPreviewSheet({
  open,
  onClose,
  name,
  detailHref,
}: Props) {
  const [data, setData] = useState<MemberData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !name) {
      setData(null);
      setErrorMsg(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setErrorMsg(null);
    (async () => {
      try {
        const res = await fetch(`/api/members/${encodeURIComponent(name)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setData(json as MemberData);
      } catch (err) {
        if (!alive) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, name]);

  const lastAction = data?.records?.[0] ?? null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="成員資訊"
      subtitle={name ?? undefined}
      footer={
        detailHref ? (
          <Link
            href={detailHref}
            onClick={onClose}
            className="press-feedback block w-full text-center bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg"
          >
            查看完整成員
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
      ) : errorMsg ? (
        <div className="px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
          {errorMsg}
        </div>
      ) : data ? (
        <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-4 md:p-5 mb-2">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-neutral-900">
              {data.member.name}
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              加入時間 ·{" "}
              {new Date(data.member.created_at).toLocaleString("zh-TW")}
            </p>
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
