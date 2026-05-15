"use client";

import { useMemo, useState } from "react";
import BottomSheet from "./BottomSheet";
import CategorySelect from "./CategorySelect";
import ZoomableImage from "./ZoomableImage";
import type { BookRow, CategoryRow } from "@/lib/supabase";

type Props = {
  book: BookRow;
  categories: CategoryRow[];
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Shared edit sheet for a book row. Lets the admin update title, category and
 * shelf location. Used by /admin (inline row actions) and /admin/books/[bookId]
 * (detail page bottom actions).
 */
export default function EditBookSheet({
  book,
  categories,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState(book.title);
  const [shelfId, setShelfId] = useState(book.shelf_id ?? "");
  const [categoryId, setCategoryId] = useState<string>(book.category_id ?? "");
  const [saving, setSaving] = useState(false);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/books/${encodeURIComponent(book.book_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            shelf_id: shelfId.trim() || null,
            category_id: categoryId || null,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      alert(`儲存失敗：${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="編輯書本"
      subtitle={book.book_id}
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
            disabled={saving || !title.trim()}
            className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition disabled:bg-neutral-300"
          >
            {saving ? "儲存中" : "儲存"}
          </button>
        </div>
      }
    >
      <div className="flex gap-4 items-start pb-3">
        {book.image_url ? (
          <ZoomableImage
            src={book.image_url}
            alt={book.title}
            className="w-20 h-28 object-cover rounded-md border border-neutral-100 shrink-0"
          />
        ) : (
          <div className="w-20 h-28 rounded-md bg-neutral-100 shrink-0" />
        )}
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              書名
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              分類
            </label>
            <CategorySelect
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={categoryOptions}
              placeholder={
                categoryOptions.length === 0
                  ? "尚無分類，請先至分類管理新增"
                  : "未分類"
              }
              disabled={categoryOptions.length === 0}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              書架位置
            </label>
            <input
              type="text"
              value={shelfId}
              onChange={(e) => setShelfId(e.target.value)}
              placeholder="（選填）"
              className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
            />
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
