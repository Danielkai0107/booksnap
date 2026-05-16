import type { BookRow } from "./supabase";

export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").trim();
}

/** 去除「(N)」副本後綴 */
export function stripCopySuffix(s: string): string {
  return s.replace(/\s*\(\d+\)\s*$/, "").trim();
}

/**
 * 把書名整理成適合丟給 Google Books 模糊搜尋的字串。
 *
 * 中文書封常見的副標題、系列名、宣傳語會讓 intitle 命中率變差，例如：
 *   「被討厭的勇氣：自我啟發之父『阿德勒』的教導」
 *   → 「被討厭的勇氣」
 *
 * 規則：
 *  1. 去除「(N)」副本後綴
 *  2. 砍掉冒號 / 全形冒號 / 破折號之後的副標題
 *  3. 去除書名號 ⟪⟫《》『』「」<> 以及多餘空白
 *  4. 上限 40 字（intitle 太長反而會 0 命中）
 */
export function normalizeForGoogleSearch(s: string): string {
  let out = stripCopySuffix(s);
  out = out.split(/[:：\-—–]/)[0] ?? out;
  out = out.replace(/[《》『』「」⟪⟫【】〈〉<>]/g, "");
  out = out.replace(/\s+/g, " ").trim();
  return out.slice(0, 40);
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
