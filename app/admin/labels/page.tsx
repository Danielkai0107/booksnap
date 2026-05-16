"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import LabelCard from "@/components/LabelCard";
import LabelPrintOptions from "@/components/LabelPrintOptions";
import {
  a4GridForLabelSize,
  readStoredLabelPrintMode,
  readStoredLabelSize,
  storeLabelPrintMode,
  storeLabelSize,
  LABEL_PRINT_MODES,
  LABEL_SIZES,
  type LabelPrintMode,
  type LabelSizeId,
} from "@/lib/labelSizes";
import { buildLabelsZplBatch, downloadTextFile } from "@/lib/labelZpl";
import { useLabelPrintPageSize } from "@/lib/useLabelPrintPageSize";
import SearchInput from "@/components/SearchInput";
import { useToast } from "@/components/ToastProvider";
import ZoomableImage from "@/components/ZoomableImage";
import { supabase, BookRow } from "@/lib/supabase";

export default function LabelsPage() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showLabels, setShowLabels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [labelSize, setLabelSize] = useState<LabelSizeId>("40x30");
  const [printMode, setPrintMode] = useState<LabelPrintMode>("thermal");
  const toast = useToast();

  useEffect(() => {
    setLabelSize(readStoredLabelSize());
    setPrintMode(readStoredLabelPrintMode());
  }, []);

  useLabelPrintPageSize(labelSize, printMode, showLabels);

  const a4Grid = useMemo(() => a4GridForLabelSize(labelSize), [labelSize]);

  const a4SheetStyle = useMemo(() => {
    if (printMode !== "a4") return undefined;
    const { widthMm, heightMm } = LABEL_SIZES[labelSize];
    return {
      gridTemplateColumns: `repeat(${a4Grid.cols}, ${widthMm}mm)`,
      gridAutoRows: `${heightMm}mm`,
      gap: `${a4Grid.gapMm}mm`,
    } as const;
  }, [printMode, labelSize, a4Grid]);

  function onLabelSizeChange(id: LabelSizeId) {
    setLabelSize(id);
    storeLabelSize(id);
  }

  function onPrintModeChange(mode: LabelPrintMode) {
    setPrintMode(mode);
    storeLabelPrintMode(mode);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data, error }, meRes] = await Promise.all([
        supabase
          .from("books")
          .select("*")
          .order("checkin_time", { ascending: false }),
        fetch("/api/me", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      if (!alive) return;
      if (error) {
        console.error("[admin/labels] fetch failed", error);
        toast.error("載入書籍清單失敗");
      } else {
        setBooks((data ?? []) as BookRow[]);
      }
      if (meRes && typeof meRes.publicSlug === "string") {
        setSlug(meRes.publicSlug as string);
      }
      if (meRes && typeof meRes.orgName === "string") {
        setOrgName(meRes.orgName as string);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.book_id.toLowerCase().includes(q),
    );
  }, [books, query]);

  const selectedBooks = useMemo(
    () => books.filter((b) => selected.has(b.book_id)),
    [books, selected],
  );

  const handleDownloadZpl = useCallback(() => {
    if (selectedBooks.length === 0) return;
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    if (!slug) {
      toast.error("缺少單位 slug，無法產生 QR 連結");
      return;
    }
    const zpl = buildLabelsZplBatch(
      selectedBooks.map((b) => ({
        bookId: b.book_id,
        title: b.title,
        slug,
        orgName,
        size: labelSize,
        origin,
      })),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(zpl, `booksnap-labels-${labelSize}-${stamp}.zpl`);
    toast.success(`已下載 ${selectedBooks.length} 張標籤的 ZPL 檔`);
  }, [selectedBooks, slug, orgName, labelSize, toast]);

  function toggle(bookId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }

  function selectAll(visible: BookRow[]) {
    setSelected(new Set(visible.map((b) => b.book_id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  const printHint = LABEL_PRINT_MODES[printMode].hint;
  const sizeLabel = LABEL_SIZES[labelSize].label;
  const a4Hint =
    printMode === "a4"
      ? `每張 A4 約可排 ${a4Grid.cols}×${a4Grid.rows}＝${a4Grid.perPage} 張（${sizeLabel}）`
      : null;

  const labelSheet = (
    <div
      className={`label-print-sheet label-print-sheet--${printMode}`}
      style={a4SheetStyle}
    >
      {selectedBooks.map((b) => (
        <LabelCard
          key={`${b.book_id}-${labelSize}-${printMode}`}
          bookId={b.book_id}
          title={b.title}
          slug={slug ?? ""}
          orgName={orgName}
          size={labelSize}
        />
      ))}
    </div>
  );

  if (showLabels) {
    return (
      <AdminShell
        onBack={() => setShowLabels(false)}
        topbarTitle="標籤預覽"
        topbarRight={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadZpl}
              className="press-feedback inline-flex items-center gap-1 text-sm font-medium text-neutral-900 bg-white border border-neutral-200 hover:border-neutral-400 px-3 h-9 rounded-full"
            >
              <span className="leading-none">ZPL</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="press-feedback inline-flex items-center gap-1 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 px-3 h-9 rounded-full"
            >
              <span className="leading-none">列印</span>
            </button>
          </div>
        }
      >
        <div className="no-print mb-6 space-y-3">
          <LabelPrintOptions
            size={labelSize}
            printMode={printMode}
            onSizeChange={onLabelSizeChange}
            onPrintModeChange={onPrintModeChange}
          />
          <p className="text-sm text-neutral-500">
            共 {selectedBooks.length} 張 · {sizeLabel}
            {printMode === "a4" ? " · A4 拼版" : " · 熱感單張"}
          </p>
          <p className="text-xs text-neutral-400">{printHint}</p>
          {a4Hint ? (
            <p className="text-xs text-neutral-400">{a4Hint}</p>
          ) : null}
          <p className="text-xs text-neutral-400">
            標籤機請用「下載 ZPL」→ 以 Zebra 驅動或 Zebra Setup Utilities
            傳送 .zpl（203 dpi）。瀏覽器列印請選與上方相同的列印方式。
          </p>
        </div>

        <div className="print-area">
          {!slug && (
            <p className="no-print mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              尚未取得單位借還網址，書籤 QR 將無法對應單位。請重新整理。
            </p>
          )}
          {printMode === "a4" ? (
            <div className="label-a4-frame">{labelSheet}</div>
          ) : (
            labelSheet
          )}
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      topbarTitle="標籤列印"
      scrollLifted
      topbarRight={
        <button
          type="button"
          onClick={() => setShowLabels(true)}
          disabled={selected.size === 0}
          className="press-feedback hidden md:inline-flex items-center gap-1 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed px-3 h-9 rounded-full"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          <span className="leading-none">
            批次列印{selected.size > 0 ? ` (${selected.size})` : ""}
          </span>
        </button>
      }
    >
      <div className="no-print mb-4 space-y-2">
        <LabelPrintOptions
          size={labelSize}
          printMode={printMode}
          onSizeChange={onLabelSizeChange}
          onPrintModeChange={onPrintModeChange}
        />
        <p className="text-xs text-neutral-400">{printHint}</p>
      </div>

      <div className="flex items-stretch gap-2 mb-5">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="搜尋書名或編號"
          wrapperClassName="flex-1 min-w-0"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
        <button
          type="button"
          onClick={() => selectAll(filtered)}
          className="shrink-0 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-4 rounded-lg transition"
        >
          全選
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="shrink-0 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-4 rounded-lg transition"
        >
          清空
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">
          {books.length === 0 ? "尚無書籍" : "沒有符合的書"}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {filtered.map((b) => {
            const checked = selected.has(b.book_id);
            return (
              <li key={b.book_id}>
                <label className="py-3.5 flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(b.book_id)}
                    className="w-4 h-4 accent-neutral-900"
                  />
                  {b.image_url ? (
                    <ZoomableImage
                      src={b.image_url}
                      alt={b.title}
                      className="w-10 h-14 object-cover rounded border border-neutral-200"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-neutral-100 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {b.title}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                      {b.book_id}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="md:hidden h-24" aria-hidden />

      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-40 px-5 pt-6 flex justify-center pointer-events-none bg-gradient-to-t from-white via-white/95 to-white/0"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <button
          type="button"
          onClick={() => setShowLabels(true)}
          disabled={selected.size === 0}
          className="pointer-events-auto inline-flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-white text-base font-medium px-7 py-4 rounded-full shadow-lg shadow-neutral-900/20 transition disabled:bg-neutral-300 disabled:shadow-none"
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
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          <span className="leading-none">
            批次列印{selected.size > 0 ? ` (${selected.size})` : ""}
          </span>
        </button>
      </div>
    </AdminShell>
  );
}
