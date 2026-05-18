import type { BookRow } from "./supabase";

export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").trim();
}

/**
 * 去除副本序號標記。
 *
 * 同時容忍前綴 `(N) 書名` 與後綴 `書名 (N)` 兩種格式：
 *  - 2026-05 之前產生的資料是後綴；
 *  - 之後改成前綴（避免清單列表 truncate 時看不到序號）。
 *
 * 兩種格式都會被 strip，下游的 coreTitle / isSameBookTitle 等比對函式
 * 因此能在新舊資料間正確判定「同一本」。
 */
export function stripCopySuffix(s: string): string {
  return s
    .replace(/^\s*\(\d+\)\s*/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
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

// --- ISBN utilities ---

/**
 * 把 ISBN 原始輸入清成只剩數字 / X 的大寫字串。
 * 連字號、空白、其他符號都會被移除。
 */
export function cleanIsbn(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function isbn10Checksum(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(first9[i], 10) * (10 - i);
  }
  const mod = (11 - (sum % 11)) % 11;
  return mod === 10 ? "X" : String(mod);
}

function isbn13Checksum(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(first12[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const mod = (10 - (sum % 10)) % 10;
  return String(mod);
}

/**
 * 把 ISBN-10 轉成等價的 ISBN-13（978 字頭）。輸入需先 cleaned。
 * 失敗回 null。
 */
export function isbn10To13(isbn10: string): string | null {
  if (!/^\d{9}[\dX]$/.test(isbn10)) return null;
  const first12 = `978${isbn10.slice(0, 9)}`;
  return first12 + isbn13Checksum(first12);
}

/**
 * 把 ISBN-13 轉成等價的 ISBN-10。只有 978 字頭可轉，其餘（如 979）回 null。
 */
export function isbn13To10(isbn13: string): string | null {
  if (!/^\d{13}$/.test(isbn13)) return null;
  if (!isbn13.startsWith("978")) return null;
  const first9 = isbn13.slice(3, 12);
  return first9 + isbn10Checksum(first9);
}

/**
 * 給一個 ISBN（可能是 10 或 13 碼），回傳所有「同一本書」的合法 ISBN 表示。
 *
 * - ISBN-13 (978 字頭) → [13, 10]
 * - ISBN-13 (其他字頭，例如 979) → [13]
 * - ISBN-10 → [10, 13]
 * - 其他無法判斷的字串 → [cleaned] 或 []
 *
 * 用途：DB 查詢時用 `.in("isbn", isbnVariants(x))`，避免 10 碼和 13 碼互查不到。
 */
export function isbnVariants(input: string | null | undefined): string[] {
  const cleaned = cleanIsbn(input);
  if (!cleaned) return [];
  const out = new Set<string>([cleaned]);
  if (/^\d{9}[\dX]$/.test(cleaned)) {
    const v13 = isbn10To13(cleaned);
    if (v13) out.add(v13);
  } else if (/^\d{13}$/.test(cleaned)) {
    const v10 = isbn13To10(cleaned);
    if (v10) out.add(v10);
  }
  return Array.from(out);
}

// --- 重複偵測 ---

/**
 * 判斷「兩個書名是不是同一本書」。比 findBestBookMatch 更嚴格，專給去重複用：
 * 寧可漏判（讓使用者多點一次「新添購」）也不要把不同書名誤判為同本。
 *
 * 命中規則（任一即視為同本）：
 *  1. normalize（去 (N) 副本 / 大小寫 / 空白）後完全相等
 *  2. coreTitle（再去副標 / 標點 / 全形）後完全相等
 *  3. 雙向 coreTitle 包含，且短的一側 ≥ 4 字
 *     - 4 字門檻是為了避開「三國」⊂「三國演義」這種短共同前綴的誤判
 *  4. Bigram 覆蓋率 ≥ 80%、短側 ≥ 5 字
 *     - 容忍中間插入幾個字元，例如 OCR「SDG超入門」與 Google
 *       「SDGs系列講堂 SDGs超入門：…」，差個 's' 子字串會破功，
 *       但 bigram 集合幾乎完全被長側涵蓋。
 */
export function isSameBookTitle(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizeTitle(stripCopySuffix(a));
  const nb = normalizeTitle(stripCopySuffix(b));
  if (na && na === nb) return true;
  const ca = coreTitle(a);
  const cb = coreTitle(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const short = ca.length < cb.length ? ca : cb;
  const long = ca.length < cb.length ? cb : ca;
  if (short.length >= 4 && long.includes(short)) return true;
  // 0.80 = 5-bigram 短字串允許掉 1 個（例如 SDG vs SDGs，中間多一個 's'
  // 讓「g超」這個 bigram 被切掉）。再低就容易把不同書誤判為同一本。
  if (short.length >= 5 && bigramCoverage(short, long) >= 0.8) return true;
  return false;
}

/**
 * 短字串的 bigram 有多少比例出現在長字串裡（0~1）。
 * 用在 isSameBookTitle 的模糊比對，處理「中間插入少量字元」的情境。
 */
function bigramCoverage(short: string, long: string): number {
  const S = bigrams(short);
  const L = bigrams(long);
  if (S.size === 0) return 0;
  let hits = 0;
  S.forEach((g) => {
    if (L.has(g)) hits++;
  });
  return hits / S.size;
}
