"use client";

import { useEffect, useMemo, useState } from "react";
import BottomSheet from "./BottomSheet";
import CategorySelect from "./CategorySelect";
import NativeDateInput from "./NativeDateInput";
import { useToast } from "./ToastProvider";
import { supabase, type CategoryRow } from "@/lib/supabase";
import { formatDateYMD, generateBookId } from "@/lib/bookId";
import type { LookupCandidate } from "@/app/api/books/lookup/route";

type Props = {
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  /** Caller should refresh its list after a successful create. */
  onCreated: () => void;
};

/**
 * 桌機後台的「手動新書入庫」彈窗。
 *
 * 為什麼存在：桌機沒有相機，原本 /checkin 的 OCR + 條碼掃描流程不適用；
 * 這個 sheet 提供一個快速的基本資料表單，讓管理員直接打書名/ISBN
 * 就把新書建到館藏。封面留空，使用者之後可在書籍詳情頁補上。
 *
 * 一些對應 /api/books 的細節：
 *  - bookId 在送出前先 query 當日最大序號 +1，沿用 useCheckinCart.submitAll
 *    的同一套規則，避免桌機與手機端撞 id。
 *  - adminName 從 /api/me 取（與 /checkin 入口處 requireUnitSession 一致）。
 *  - 同時提供「查 ISBN」按鈕串 Google Books，輸入 ISBN 後可一鍵
 *    填入書名/作者/出版社/出版日，減少手 key 量。
 */
export default function ManualCheckinSheet({
  open,
  onClose,
  categories,
  onCreated,
}: Props) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [isbn, setIsbn] = useState("");
  const [authors, setAuthors] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );

  // 每次打開都把表單清空，避免上一次填過的內容殘留誤導使用者。
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setCategoryId("");
    setIsbn("");
    setAuthors("");
    setPublisher("");
    setPublishedDate("");
    setSubmitting(false);
    setLookupLoading(false);
  }, [open]);

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
        { cache: "no-store" },
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
              : "Google Books 查無此 ISBN",
        );
        return;
      }
      // 只填空白欄位，不覆寫使用者已經打過的內容。
      if (!title.trim()) setTitle(c.title);
      if (!authors.trim() && c.authors.length > 0)
        setAuthors(c.authors.join("、"));
      if (!publisher.trim() && c.publisher) setPublisher(c.publisher);
      if (!publishedDate.trim() && c.publishedDate)
        setPublishedDate(c.publishedDate);
      toast.success("已套用 Google Books 資料");
    } catch (err) {
      console.warn("[manual checkin] lookup failed", err);
      toast.error("查詢失敗，請稍後再試");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("請輸入書名");
      return;
    }
    setSubmitting(true);
    try {
      // operator 名稱：與 /checkin SSR 那邊保持一致的 fallback 邏輯。
      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (!meRes.ok) throw new Error("無法取得使用者資料");
      const me = (await meRes.json()) as {
        orgName?: string | null;
        email?: string | null;
      };
      const adminName =
        me.orgName?.trim() ||
        (me.email ? me.email.split("@")[0] : "") ||
        "管理員";

      // 接續當日序號（LIB-YYYYMMDD-XXX）：query 最大序號 +1，
      // 與 useCheckinCart.submitAll 同一套規則，避免桌機/手機撞 id。
      const now = new Date();
      const prefix = `LIB-${formatDateYMD(now)}-`;
      let nextSeq = 1;
      try {
        const { data: existing } = await supabase
          .from("books")
          .select("book_id")
          .like("book_id", `${prefix}%`)
          .order("book_id", { ascending: false })
          .limit(1);
        const lastId = existing?.[0]?.book_id as string | undefined;
        if (lastId) {
          const parsed = parseInt(lastId.slice(prefix.length), 10);
          if (!Number.isNaN(parsed)) nextSeq = parsed + 1;
        }
      } catch (err) {
        console.warn("[manual checkin] fetch latest id failed", err);
      }

      const cleanedIsbn = isbn.trim().replace(/[-\s]/g, "") || null;
      const cleanedDate = publishedDate.trim() || null;

      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName,
          books: [
            {
              title: trimmedTitle,
              bookId: generateBookId(now, nextSeq),
              // 桌機手動入庫不附封面；使用者後續可在書本詳情頁編輯補圖。
              imageBase64: null,
              remoteImageUrl: null,
              categoryId: categoryId || null,
              isbn: cleanedIsbn,
              authors: authors.trim() || null,
              publisher: publisher.trim() || null,
              publishedDate: cleanedDate,
            },
          ],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast.success(`已新增：${trimmedTitle}`);
      onCreated();
      onClose();
    } catch (err) {
      console.error("[manual checkin] failed", err);
      toast.error(err instanceof Error ? err.message : "新增失敗");
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="新書入庫"
      subtitle="手動填寫基本資料 · 封面可至書本詳情頁補上"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition disabled:bg-neutral-300"
          >
            {submitting ? "新增中…" : "確認入庫"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 pb-3">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">
            書名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="輸入書名"
            autoFocus
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
      </div>

      <div className="pt-2 mt-3 border-t border-neutral-100 space-y-3">
        <p className="text-xs font-medium text-neutral-500">出版資訊（選填）</p>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">
            ISBN
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="例：9789861371955"
              className="flex-1 h-[46px] border border-neutral-200 rounded-md px-3 text-sm font-mono tabular-nums focus:outline-none focus:border-neutral-900 transition"
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={lookupLoading || !isbn.trim()}
              className="h-[46px] px-4 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-xs font-medium rounded-md transition disabled:bg-neutral-50 disabled:text-neutral-300"
            >
              {lookupLoading ? "查詢中" : "查 ISBN"}
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
              className="w-full h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              出版日期
            </label>
            <NativeDateInput
              value={publishedDate}
              onChange={setPublishedDate}
              className="w-full min-w-0 box-border h-[46px] border border-neutral-200 rounded-md px-3 text-sm focus:outline-none focus:border-neutral-900 transition"
            />
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
