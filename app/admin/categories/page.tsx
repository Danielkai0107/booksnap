"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import BottomSheet from "@/components/BottomSheet";
import Toast, { type ToastKind } from "@/components/Toast";
import type { CategoryRow } from "@/lib/supabase";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    kind: ToastKind;
  }>({ open: false, message: "", kind: "success" });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCategories((data.categories ?? []) as CategoryRow[]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  return (
    <AdminShell backHref="/admin">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
            分類管理
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="leading-none">新增分類</span>
          </button>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
         目前共 {categories.length} 個
        </p>
      </header>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋分類名稱"
        className="w-full mb-6 px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
      />

      {errorMsg && (
        <div className="mb-6 px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">
          {categories.length === 0 ? "尚無分類" : "沒有符合的分類"}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-3.5 border border-neutral-200 rounded-xl bg-white"
            >
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <span className="inline-flex w-9 h-9 rounded-lg bg-neutral-100 items-center justify-center text-neutral-500 shrink-0">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M2 3.5a1.5 1.5 0 0 1 1.5-1.5h3.379a1.5 1.5 0 0 1 1.06.44l3.621 3.62a1.5 1.5 0 0 1 0 2.122l-3.379 3.378a1.5 1.5 0 0 1-2.121 0L2.44 7.94A1.5 1.5 0 0 1 2 6.879V3.5Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <circle cx="4.75" cy="4.75" r="0.85" fill="currentColor" />
                  </svg>
                </span>
                <p className="font-medium text-neutral-900 truncate">{c.name}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditTarget(c)}
                  className="text-xs text-neutral-600 hover:text-neutral-900 px-3 py-2 rounded-lg hover:bg-neutral-100 transition"
                >
                  編輯
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(c)}
                  className="text-xs text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition"
                >
                  刪除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 手機版底部留白，避免列表被浮動按鈕遮擋 */}
      <div className="md:hidden h-24" aria-hidden />

      {/* 手機版底部固定「新增分類」按鈕 */}
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
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="leading-none">新增分類</span>
        </button>
      </div>

      {addOpen && (
        <CategoryEditSheet
          onClose={() => setAddOpen(false)}
          onSaved={(name) => {
            setAddOpen(false);
            void fetchAll();
            setToast({
              open: true,
              message: `已新增分類「${name}」`,
              kind: "success",
            });
          }}
        />
      )}

      {editTarget && (
        <CategoryEditSheet
          category={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void fetchAll();
          }}
        />
      )}

      {deleteTarget && (
        <BottomSheet
          open
          onClose={() => setDeleteTarget(null)}
          title="刪除分類？"
          subtitle={`「${deleteTarget.name}」會從分類中移除`}
          footer={
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  try {
                    const res = await fetch(`/api/categories/${target.id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? `HTTP ${res.status}`);
                    }
                    void fetchAll();
                  } catch (err) {
                    alert(
                      `刪除失敗：${err instanceof Error ? err.message : String(err)}`
                    );
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-3 rounded-lg transition"
              >
                確認刪除
              </button>
            </div>
          }
        >
          <p className="text-sm text-neutral-600 pb-4">
            已使用此分類的書籍不會被刪除，僅會清除其分類設定。
          </p>
        </BottomSheet>
      )}

      <Toast
        open={toast.open}
        message={toast.message}
        kind={toast.kind}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </AdminShell>
  );
}

function CategoryEditSheet({
  category,
  onClose,
  onSaved,
}: {
  category?: CategoryRow;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch(
        isEdit ? `/api/categories/${category!.id}` : "/api/categories",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onSaved(trimmed);
    } catch (err) {
      alert(`儲存失敗：${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={isEdit ? "編輯分類" : "新增分類"}
      subtitle={
        isEdit ? "更名後使用此分類的書籍會自動更新顯示" : "輸入新分類名稱"
      }
      footer={
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition disabled:bg-neutral-300"
          >
            {saving ? "儲存中" : "儲存"}
          </button>
        </div>
      }
    >
      <div className="pb-4">
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          分類名稱
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：文學小說"
          className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
      </div>
    </BottomSheet>
  );
}
