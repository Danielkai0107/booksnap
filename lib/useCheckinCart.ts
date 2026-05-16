"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateYMD, generateBookId } from "@/lib/bookId";
import { supabase } from "@/lib/supabase";
import {
  QuotaExceededError,
  isQuotaErrorPayload,
} from "@/lib/billing/clientErrors";

/**
 * 共用購物車形式的「待入庫書籍」狀態。
 * 兩個掃描頁（拍封面 / 掃條碼）都會用同一份 sessionStorage 資料，
 * 使用者可以在切換模式之間累積。
 */

export type ConfirmedBook = {
  title: string;
  /** 相機拍下的 base64；若使用 Google 封面則為 null。 */
  imageDataUrl: string | null;
  /** Google Books 提供的封面 URL；提交時優先使用。 */
  remoteImageUrl: string | null;
  categoryId: string | null;
  isbn: string | null;
  authors: string | null;
  publisher: string | null;
  publishedDate: string | null;
};

const BOOKS_KEY = "books";
const ADMIN_KEY = "adminName";

function normalize(raw: unknown): ConfirmedBook | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== "string") return null;
  return {
    title: r.title,
    imageDataUrl: typeof r.imageDataUrl === "string" ? r.imageDataUrl : null,
    remoteImageUrl:
      typeof r.remoteImageUrl === "string" ? r.remoteImageUrl : null,
    categoryId: typeof r.categoryId === "string" ? r.categoryId : null,
    isbn: typeof r.isbn === "string" ? r.isbn : null,
    authors: typeof r.authors === "string" ? r.authors : null,
    publisher: typeof r.publisher === "string" ? r.publisher : null,
    publishedDate:
      typeof r.publishedDate === "string" ? r.publishedDate : null,
  };
}

export function useCheckinCart(options?: { redirectIfNoAdmin?: boolean }) {
  const router = useRouter();
  const redirect = options?.redirectIfNoAdmin ?? true;
  const [adminName, setAdminName] = useState("");
  const [books, setBooks] = useState<ConfirmedBook[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(ADMIN_KEY);
    if (!stored) {
      // `/checkin` re-seeds the operator name from the session, so a missing
      // value usually means a hard refresh on the scan page. Bouncing through
      // it picks the operator up again (or sends the user to /admin if the
      // session expired).
      if (redirect) router.replace("/checkin");
      setHydrated(true);
      return;
    }
    setAdminName(stored);
    const existing = sessionStorage.getItem(BOOKS_KEY);
    if (existing) {
      try {
        const arr = JSON.parse(existing) as unknown[];
        if (Array.isArray(arr)) {
          const cleaned = arr
            .map(normalize)
            .filter((b): b is ConfirmedBook => b !== null);
          setBooks(cleaned);
        }
      } catch {
        sessionStorage.removeItem(BOOKS_KEY);
      }
    }
    setHydrated(true);
  }, [redirect, router]);

  const persist = useCallback((next: ConfirmedBook[]) => {
    setBooks(next);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(BOOKS_KEY, JSON.stringify(next));
    }
  }, []);

  const addBook = useCallback(
    (book: ConfirmedBook) => {
      persist([...books, book]);
    },
    [books, persist]
  );

  const removeBookAt = useCallback(
    (idx: number) => {
      persist(books.filter((_, i) => i !== idx));
    },
    [books, persist]
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  const submitAll = useCallback(async (): Promise<void> => {
    if (books.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const ymd = formatDateYMD(now);
      const prefix = `LIB-${ymd}-`;
      let startSeq = 1;
      try {
        const { data: existing } = await supabase
          .from("books")
          .select("book_id")
          .like("book_id", `${prefix}%`)
          .order("book_id", { ascending: false })
          .limit(1);
        const lastId = existing?.[0]?.book_id as string | undefined;
        if (lastId) {
          const lastSeq = parseInt(lastId.slice(prefix.length), 10);
          if (!Number.isNaN(lastSeq)) startSeq = lastSeq + 1;
        }
      } catch (err) {
        console.warn("[checkin] failed to fetch existing book_ids", err);
      }

      const payload = {
        adminName,
        books: books.map((b, idx) => ({
          title: b.title,
          bookId: generateBookId(now, startSeq + idx),
          imageBase64: b.imageDataUrl,
          remoteImageUrl: b.remoteImageUrl,
          categoryId: b.categoryId,
          isbn: b.isbn,
          authors: b.authors,
          publisher: b.publisher,
          publishedDate: b.publishedDate,
        })),
      };

      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        if (isQuotaErrorPayload(data)) {
          throw new QuotaExceededError(data);
        }
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const count = books.length;
      sessionStorage.removeItem(BOOKS_KEY);
      sessionStorage.removeItem(ADMIN_KEY);
      sessionStorage.setItem(
        "pendingToast",
        JSON.stringify({
          message: `已成功入庫 ${count} 本新書`,
          kind: "success",
        })
      );
      router.push("/admin");
    } catch (err) {
      setSubmitting(false);
      throw err;
    }
  }, [adminName, books, router, submitting]);

  const totalCount = useMemo(() => books.length, [books]);

  return {
    adminName,
    books,
    hydrated,
    submitting,
    totalCount,
    addBook,
    removeBookAt,
    clear,
    submitAll,
  };
}
