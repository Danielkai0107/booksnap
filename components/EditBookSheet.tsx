"use client";

import { useMemo, useState } from "react";
import BottomSheet from "./BottomSheet";
import CategorySelect from "./CategorySelect";
import NativeDateInput from "./NativeDateInput";
import { useToast } from "./ToastProvider";
import ZoomableImage from "./ZoomableImage";
import type { BookRow, CategoryRow } from "@/lib/supabase";
import type { LookupCandidate } from "@/app/api/books/lookup/route";

const fieldInputClass =
  "w-full min-w-0 box-border h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition";

const dateInputClass = `${fieldInputClass} disabled:bg-neutral-50 disabled:text-neutral-400`;

type Props = {
  book: BookRow;
  categories: CategoryRow[];
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Shared edit sheet for a book row. Lets the admin update title, category,
 * shelf location and the ISBN / metadata fields. Also offers a 「重查 ISBN」
 * button that calls Google Books and one-click fills the metadata.
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
  const [isbn, setIsbn] = useState(book.isbn ?? "");
  const [authors, setAuthors] = useState(book.authors ?? "");
  const [publisher, setPublisher] = useState(book.publisher ?? "");
  const [publishedDate, setPublishedDate] = useState(book.published_date ?? "");
  const [saving, setSaving] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const toast = useToast();

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
            isbn: isbn.trim() || null,
            authors: authors.trim() || null,
            publisher: publisher.trim() || null,
            // 後端只接受 yyyy-mm-dd，非完整日期會被自動轉成 null。
            published_date: publishedDate.trim() || null,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      console.error("[edit] save failed", err);
      toast.error("儲存失敗，請稍後再試");
      setSaving(false);
    }
  }

  async function handleLookup() {
    const cleaned = isbn.trim().replace(/[-\s]/g, "");
    if (!cleaned) {
      toast.error("請先輸入 ISBN");
      return;
    }
    setLookupLoading(true);
    try {
      const res = await fetch(
        `/api/books/lookup?isbn=${encodeURIComponent(cleaned)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        candidates?: LookupCandidate[];
        error?: "rate_limited" | "failed" | null;
      };
      const c = data.candidates?.[0];
      if (!c) {
        toast.error(
          data.error === "rate_limited"
            ? "Google Books 今日配額已用完，請改手動輸入"
            : data.error === "failed"
              ? "查詢失敗，請稍後再試"
              : "Google Books 查無此 ISBN"
        );
        return;
      }
      if (!title.trim()) setTitle(c.title);
      if (!authors.trim() && c.authors.length > 0)
        setAuthors(c.authors.join("、"));
      if (!publisher.trim() && c.publisher) setPublisher(c.publisher);
      if (!publishedDate.trim() && c.publishedDate)
        setPublishedDate(c.publishedDate);
      toast.success("已套用 Google Books 資料");
    } catch (err) {
      console.warn("[edit] lookup failed", err);
      toast.error("查詢失敗，請稍後再試");
    } finally {
      setLookupLoading(false);
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

      <div className="pt-2 mt-3 border-t border-neutral-100 space-y-3">
        <p className="text-xs font-medium text-neutral-500">
          出版資訊（選填）
        </p>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">
            ISBN
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="例：9789861371955"
              className="flex-1 h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={lookupLoading || !isbn.trim()}
              className="h-[46px] px-4 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-xs font-medium rounded-md transition disabled:bg-neutral-50 disabled:text-neutral-300"
            >
              {lookupLoading ? "查詢中" : "重查 ISBN"}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">
            作者
          </label>
          <input
            type="text"
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="多位作者請用「、」分隔"
            className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
          />
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              出版社
            </label>
            <input
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              className={fieldInputClass}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              出版日期
            </label>
            <NativeDateInput
              value={publishedDate}
              onChange={setPublishedDate}
              className={dateInputClass}
            />
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
