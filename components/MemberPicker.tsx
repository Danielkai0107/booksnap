"use client";

import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";

type Member = {
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
  title?: string;
  subtitle?: string;
};

export default function MemberPicker({
  open,
  onClose,
  onSelect,
  title = "你是誰？",
  subtitle = "請從成員清單選擇你的名字",
}: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setQuery("");
    let alive = true;
    setLoading(true);
    setErrorMsg(null);
    (async () => {
      try {
        const res = await fetch("/api/members", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { members?: Member[] };
        if (!alive) return;
        setMembers(data.members ?? []);
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
  }, [open]);

  const filtered = query.trim()
    ? members.filter((m) =>
        m.name.toLowerCase().includes(query.trim().toLowerCase())
      )
    : members;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <button
          type="button"
          disabled={!picked}
          onClick={() => {
            if (!picked) return;
            onSelect(picked);
          }}
          className="w-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-lg transition disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
        >
          {picked ? `確認：${picked}` : "請選擇成員"}
        </button>
      }
    >
      <div className="sticky top-0 z-10 -mx-6 px-6 pt-1 pb-3 bg-white">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋成員"
          className="w-full h-[46px] px-3.5 rounded-lg border border-neutral-200 bg-white text-sm focus:outline-none focus:border-neutral-900 transition"
        />
      </div>
      {errorMsg && <p className="text-sm text-red-600 mb-3">{errorMsg}</p>}
      {loading ? (
        <div className="py-10 flex justify-center">
          <div className="w-6 h-6 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-neutral-500">
            {members.length === 0
              ? "尚無成員。請至後台「成員管理」新增。"
              : "沒有符合的成員"}
          </p>
        </div>
      ) : (
        <ul className="pb-2 space-y-2">
          {filtered.map((m) => {
            const active = picked === m.name;
            return (
              <li key={m.name}>
                <button
                  type="button"
                  onClick={() => setPicked(m.name)}
                  className={`w-full text-center px-4 py-3 rounded-lg border-2 transition text-base font-medium ${
                    active
                      ? "bg-neutral-100 text-neutral-900 border-neutral-900"
                      : "bg-neutral-100 text-neutral-900 border-transparent"
                  }`}
                >
                  {m.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
