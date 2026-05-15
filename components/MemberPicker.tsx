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

  useEffect(() => {
    if (!open) return;
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
    <BottomSheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋成員"
          className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 bg-white text-sm focus:outline-none focus:border-neutral-900 transition"
        />
      </div>
      {errorMsg && (
        <p className="text-sm text-red-600 mb-3">{errorMsg}</p>
      )}
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
        <ul className="pb-4">
          {filtered.map((m) => (
            <li key={m.name}>
              <button
                onClick={() => {
                  onSelect(m.name);
                  onClose();
                }}
                className="w-full text-left px-4 py-3.5 rounded-lg hover:bg-neutral-50 transition flex items-center gap-3 border-b border-neutral-100 last:border-b-0"
              >
                <span className="w-9 h-9 rounded-full bg-neutral-100 text-neutral-900 text-sm font-medium flex items-center justify-center">
                  {m.name.charAt(0)}
                </span>
                <span className="text-base font-medium text-neutral-900">
                  {m.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
