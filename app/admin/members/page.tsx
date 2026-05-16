"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import BottomSheet from "@/components/BottomSheet";
import SearchInput from "@/components/SearchInput";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";

type Member = {
  name: string;
  created_at: string;
  holdingCount: number;
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const toast = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, booksRes] = await Promise.all([
        supabase
          .from("members")
          .select("name, created_at")
          .order("created_at", { ascending: true }),
        supabase
          .from("books")
          .select("current_holder")
          .not("current_holder", "is", null),
      ]);
      if (membersRes.error) throw membersRes.error;
      if (booksRes.error) throw booksRes.error;
      const countMap = new Map<string, number>();
      (booksRes.data ?? []).forEach((row) => {
        const h = (row as { current_holder: string | null }).current_holder;
        if (h) countMap.set(h, (countMap.get(h) ?? 0) + 1);
      });
      const list = (membersRes.data ?? []).map((m) => ({
        name: m.name as string,
        created_at: m.created_at as string,
        holdingCount: countMap.get(m.name as string) ?? 0,
      }));
      setMembers(list);
    } catch (err) {
      console.error("[admin/members] fetch failed", err);
      toast.error("載入成員清單失敗");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, query]);

  return (
    <AdminShell backHref="/admin">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
            成員管理
          </h1>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="hidden md:inline-flex shrink-0 items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-3 rounded-xl transition"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            <span className="leading-none">新增成員</span>
          </button>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          目前共 {members.length} 位成員
        </p>
      </header>

      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder="搜尋成員姓名"
        wrapperClassName="mb-6"
        className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
      />

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">
          {members.length === 0 ? "尚無成員。新增第一位成員吧" : "沒有符合的成員"}
        </p>
      ) : (
        <>
          <ul className="md:hidden space-y-2.5">
            {filtered.map((m) => (
              <li key={m.name}>
                <Link
                  href={`/admin/members/${encodeURIComponent(m.name)}`}
                  className="press-feedback flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-neutral-100 hover:bg-neutral-200/70"
                >
                  <div>
                    <p className="font-medium text-neutral-900">{m.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      目前持有 {m.holdingCount} 本
                    </p>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 14 14"
                    fill="none"
                    className="text-neutral-400 shrink-0"
                    aria-hidden
                  >
                    <path
                      d="M5 2L10 7L5 12"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden md:block overflow-x-auto border border-neutral-100 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50/60 text-neutral-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">姓名</th>
                  <th className="text-left px-5 py-3 font-medium">加入時間</th>
                  <th className="text-left px-5 py-3 font-medium">目前持有</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((m) => (
                  <tr
                    key={m.name}
                    onClick={() => {
                      window.location.href = `/admin/members/${encodeURIComponent(m.name)}`;
                    }}
                    className="hover:bg-neutral-50/60 transition cursor-pointer"
                  >
                    <td className="px-5 py-3.5 text-neutral-900 font-medium">
                      {m.name}
                    </td>
                    <td className="px-5 py-3.5 text-neutral-500 tabular-nums">
                      {new Date(m.created_at).toLocaleString("zh-TW")}
                    </td>
                    <td className="px-5 py-3.5 text-neutral-700">
                      {m.holdingCount} 本
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 手機版底部留白，避免列表被浮動按鈕遮擋 */}
      <div className="md:hidden h-24" aria-hidden />

      {/* 手機版底部固定「新增成員」按鈕 */}
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-40 px-5 pt-6 flex justify-center pointer-events-none bg-gradient-to-t from-white via-white/95 to-white/0"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="pointer-events-auto inline-flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-white text-base font-medium px-7 py-4 rounded-full shadow-lg shadow-neutral-900/20 transition"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <span className="leading-none">新增成員</span>
        </button>
      </div>

      {addOpen && (
        <AddMemberSheet
          onClose={() => setAddOpen(false)}
          onAdded={(name) => {
            setAddOpen(false);
            void fetchAll();
            toast.success(`已新增成員「${name}」`);
          }}
        />
      )}

    </AdminShell>
  );
}

function AddMemberSheet({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onAdded(trimmed);
    } catch (err) {
      console.error("[admin/members] add failed", err);
      toast.error("新增失敗，請稍後再試");
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="新增成員"
      subtitle="此名稱會出現在前台借/還書選單"
      footer={
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            取消
          </button>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || saving}
            className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition disabled:bg-neutral-300"
          >
            {saving ? "新增中" : "新增"}
          </button>
        </div>
      }
    >
      <div className="pb-4">
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          姓名
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：王小明"
          className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
      </div>
    </BottomSheet>
  );
}
