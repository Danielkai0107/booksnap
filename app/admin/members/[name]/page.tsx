"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import BottomSheet from "@/components/BottomSheet";
import { BorrowRecordRow, MemberRow } from "@/lib/supabase";

type Tab = "borrow" | "return";

type Holding = {
  book_id: string;
  title: string;
  image_url: string | null;
};

export default function MemberDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const name = decodeURIComponent(params.name);

  const [member, setMember] = useState<MemberRow | null>(null);
  const [holding, setHolding] = useState<Holding[]>([]);
  const [records, setRecords] = useState<BorrowRecordRow[]>([]);
  const [tab, setTab] = useState<Tab>("borrow");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/members/${encodeURIComponent(name)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setMember(data.member as MemberRow);
        setHolding((data.holding ?? []) as Holding[]);
        setRecords((data.records ?? []) as BorrowRecordRow[]);
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
  }, [name]);

  const returnedRecords = useMemo(
    () => records.filter((r) => r.returned_at),
    [records]
  );

  const lastAction = records[0] ?? null;

  async function handleDelete() {
    try {
      const res = await fetch(
        `/api/members/${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push("/admin/members");
    } catch (err) {
      alert(`刪除失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <AdminShell
      backHref="/admin/members"
      desktopBack={{ href: "/admin/members", label: "回成員列表" }}
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : errorMsg ? (
        <div className="px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
          {errorMsg}
        </div>
      ) : member ? (
        <>
          <section className="bg-neutral-50/50 border border-neutral-100 rounded-2xl p-5 md:p-7 mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
                  {member.name}
                </h1>
                <p className="mt-1 text-xs text-neutral-500">
                  加入時間 ·{" "}
                  {new Date(member.created_at).toLocaleString("zh-TW")}
                </p>
                {lastAction && (
                  <p className="mt-2 text-xs text-neutral-500">
                    最近動作 ·{" "}
                    {lastAction.returned_at
                      ? `${new Date(lastAction.returned_at).toLocaleString("zh-TW")} 歸還`
                      : `${new Date(lastAction.borrowed_at).toLocaleString("zh-TW")} 借出`}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="text-xs text-red-600 hover:text-red-700 px-3 py-1.5 rounded-md border border-red-100 hover:border-red-200 transition"
              >
                刪除成員
              </button>
            </div>

            <div className="mt-5">
              <p className="text-xs font-medium text-neutral-500 mb-2">
                目前持有 {holding.length} 本
              </p>
              {holding.length === 0 ? (
                <p className="text-sm text-neutral-400">無持有書本</p>
              ) : (
                <ul className="flex gap-3 overflow-x-auto pb-1">
                  {holding.map((b) => (
                    <li key={b.book_id} className="shrink-0">
                      <Link
                        href={`/admin/books/${encodeURIComponent(b.book_id)}`}
                        className="block w-20 text-center"
                      >
                        {b.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={b.image_url}
                            alt=""
                            className="w-20 h-28 object-cover rounded-md border border-neutral-200"
                          />
                        ) : (
                          <div className="w-20 h-28 bg-neutral-100 rounded-md" />
                        )}
                        <p className="mt-1.5 text-xs text-neutral-700 line-clamp-2">
                          {b.title}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <div className="flex gap-1 border-b border-neutral-200 mb-5">
              <TabBtn active={tab === "borrow"} onClick={() => setTab("borrow")}>
                借書紀錄 ({records.length})
              </TabBtn>
              <TabBtn active={tab === "return"} onClick={() => setTab("return")}>
                還書紀錄 ({returnedRecords.length})
              </TabBtn>
            </div>

            {tab === "borrow" ? (
              <RecordList
                records={records}
                empty="尚無借書紀錄"
                timeKey="borrowed_at"
                timeLabel="借出時間"
              />
            ) : (
              <RecordList
                records={returnedRecords}
                empty="尚無還書紀錄"
                timeKey="returned_at"
                timeLabel="歸還時間"
              />
            )}
          </section>

          {deleteOpen && (
            <BottomSheet
              open
              onClose={() => setDeleteOpen(false)}
              title="刪除成員？"
              subtitle="此操作無法復原"
              footer={
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteOpen(false)}
                    className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-3 rounded-lg transition"
                  >
                    確認刪除
                  </button>
                </div>
              }
            >
              <p className="text-sm text-neutral-600 pb-4">
                成員「{member.name}」將從系統移除。
                {holding.length > 0 &&
                  "因目前仍有借出未還的書，請先完成歸還才能刪除。"}
              </p>
            </BottomSheet>
          )}
        </>
      ) : null}
    </AdminShell>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
        active
          ? "text-neutral-900 border-neutral-900"
          : "text-neutral-500 hover:text-neutral-900 border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

function RecordList({
  records,
  empty,
  timeKey,
  timeLabel,
}: {
  records: BorrowRecordRow[];
  empty: string;
  timeKey: "borrowed_at" | "returned_at";
  timeLabel: string;
}) {
  if (records.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">{empty}</p>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
      {records.map((r) => {
        const t = r[timeKey];
        return (
          <li
            key={r.id}
            className="py-3.5 flex items-center justify-between gap-3"
          >
            <Link
              href={`/admin/books/${encodeURIComponent(r.book_id)}`}
              className="text-sm font-mono text-neutral-900 hover:underline"
            >
              {r.book_id}
            </Link>
            <div className="text-xs text-neutral-500 tabular-nums text-right">
              <span className="text-neutral-400">{timeLabel}：</span>
              {t ? new Date(t).toLocaleString("zh-TW") : "—"}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
