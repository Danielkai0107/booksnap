import type { BookRow } from "./supabase";

export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").trim();
}

/** 去除「(N)」副本後綴 */
export function stripCopySuffix(s: string): string {
  return s.replace(/\s*\(\d+\)\s*$/, "").trim();
}

/**
 * 從候選書中找符合 title 的第一本，忽略大小寫與空白，
 * 並把「(N)」副本後綴視為同一本。
 */
export function findBookByTitle(
  title: string,
  candidates: BookRow[],
  excludeIds?: Set<string>
): BookRow | undefined {
  const target = normalizeTitle(stripCopySuffix(title));
  if (!target) return undefined;
  return candidates.find((c) => {
    if (excludeIds?.has(c.book_id)) return false;
    return normalizeTitle(stripCopySuffix(c.title)) === target;
  });
}
