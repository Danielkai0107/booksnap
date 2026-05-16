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
 *
 * @deprecated 推薦使用 findBestBookMatch（含模糊比對）。
 */
export function findBookByTitle(
  title: string,
  candidates: BookRow[],
  excludeIds?: Set<string>
): BookRow | undefined {
  return findBestBookMatch(title, candidates, { excludeIds })?.book;
}

/**
 * 把書名整理成「核心書名」用於比對：
 *  - 去 (N) 副本後綴
 *  - 砍掉冒號/破折號之後的副標題
 *  - 去除書名號與標點
 *  - 全形數字英文轉半形、空白移除、轉小寫
 */
export function coreTitle(s: string): string {
  let out = stripCopySuffix(s);
  out = out.split(/[:：\-—–~～]/)[0] ?? out;
  out = out.replace(/[《》『』「」⟪⟫【】〈〉<>()（）\[\]［］]/g, "");
  out = out.replace(/[!?。，,.！？、:;；…·・「」"']/g, "");
  out = out.toLowerCase();
  // 全形 → 半形
  out = out.replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
  return out.replace(/\s+/g, "").trim();
}

export type MatchResult = {
  book: BookRow;
  /** 0~1，越高越像。1 = 完全相等。 */
  confidence: number;
  reason: "exact" | "core-exact" | "contains" | "edit-distance" | "jaccard";
};

/**
 * 從候選書中找最像的一本。多階比對，前一階命中就回傳，省 token 也省心：
 *  1. exact：normalize 後完全相等
 *  2. core-exact：去副標 / 標點後完全相等
 *  3. contains：雙向包含（且短的那段 ≥ 3 字）
 *  4. edit-distance：Levenshtein 距離 / 較長者長度 ≤ 0.25
 *  5. jaccard：bigram 字元集合相似度 ≥ 0.55
 *
 * 都不命中回 undefined。
 */
export function findBestBookMatch(
  title: string,
  candidates: BookRow[],
  opts: { excludeIds?: Set<string>; minConfidence?: number } = {},
): MatchResult | undefined {
  const minConfidence = opts.minConfidence ?? 0.6;
  const rawTarget = normalizeTitle(stripCopySuffix(title));
  const targetCore = coreTitle(title);
  if (!targetCore) return undefined;

  const usable = candidates.filter(
    (c) => !opts.excludeIds?.has(c.book_id),
  );

  // 1. exact
  for (const c of usable) {
    if (normalizeTitle(stripCopySuffix(c.title)) === rawTarget) {
      return { book: c, confidence: 1, reason: "exact" };
    }
  }
  // 2. core-exact
  for (const c of usable) {
    if (coreTitle(c.title) === targetCore) {
      return { book: c, confidence: 0.95, reason: "core-exact" };
    }
  }
  // 3. contains（任一方包含另一方，且短的那段至少 3 字才算）
  for (const c of usable) {
    const cCore = coreTitle(c.title);
    if (!cCore) continue;
    const short = targetCore.length < cCore.length ? targetCore : cCore;
    const long = targetCore.length < cCore.length ? cCore : targetCore;
    if (short.length >= 3 && long.includes(short)) {
      const ratio = short.length / long.length;
      return {
        book: c,
        confidence: 0.7 + ratio * 0.2,
        reason: "contains",
      };
    }
  }
  // 4 + 5. 計算分數取最高
  let best: MatchResult | undefined;
  for (const c of usable) {
    const cCore = coreTitle(c.title);
    if (!cCore) continue;
    const ed = editDistance(targetCore, cCore);
    const longer = Math.max(targetCore.length, cCore.length);
    const edSim = 1 - ed / longer;
    if (edSim >= 0.75) {
      const score = edSim;
      if (!best || score > best.confidence) {
        best = { book: c, confidence: score, reason: "edit-distance" };
      }
      continue;
    }
    const jac = bigramJaccard(targetCore, cCore);
    if (jac >= 0.55) {
      const score = 0.55 + (jac - 0.55) * 0.8;
      if (!best || score > best.confidence) {
        best = { book: c, confidence: score, reason: "jaccard" };
      }
    }
  }
  if (best && best.confidence >= minConfidence) return best;
  return undefined;
}

// --- 工具函式 ---

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  // 滾動陣列節省記憶體
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function bigramJaccard(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach((g) => {
    if (B.has(g)) inter++;
  });
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length < 2) {
    if (s.length === 1) out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) {
    out.add(s.slice(i, i + 2));
  }
  return out;
}
