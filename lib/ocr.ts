export type RecognizeResult = {
  title: string;
  category: string | null;
  source: "claude" | "tesseract";
  /**
   * 本期智能辨識剩餘次數（含本次扣除後的結果）。
   *   - 數值 ≥ 0：拍照確認頁可顯示「剩餘 N 次」灰字。
   *   - `null`：本次未取得（多半是 401 / 網路錯誤），UI 隱藏字串即可。
   */
  remaining: number | null;
  /**
   * 是否因配額用盡而被伺服器跳過 Claude 呼叫。
   * 為 true 時 title/category 一定是空值，前端應直接進入確認頁讓使用者手動輸入。
   */
  skipped: boolean;
};

/**
 * Recognize a book cover title (and optionally a category) from a base64 image.
 *
 * Default engine: Anthropic Claude vision (高準確率，對中文書封表現最佳)。
 * 若提供 `categories`，Claude 會從清單中挑選最合適的分類。
 *
 * Errors are always swallowed — caller treats them as "empty title", so the
 * user can simply type the title manually. Server-side lock checks return 403
 * which we also treat as empty (the outer UI should have already blocked the
 * scan page, so this path is purely defensive).
 */
export async function recognizeBookCover(
  imageBase64: string,
  categories?: string[],
): Promise<RecognizeResult> {
  try {
    const response = await fetch("/api/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, categories: categories ?? [] }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.warn("[ocr] /api/recognize not ok", response.status, data);
      return {
        title: "",
        category: null,
        source: "claude",
        remaining: null,
        skipped: false,
      };
    }
    const data = (await response.json()) as {
      title?: string;
      category?: string | null;
      source?: "claude" | "tesseract";
      remaining?: number | null;
      skipped?: boolean;
    };
    const title = (data.title ?? "").trim();
    return {
      title: title === "無法識別" ? "" : title,
      category: data.category ?? null,
      source: data.source ?? "claude",
      remaining:
        typeof data.remaining === "number" ? data.remaining : null,
      skipped: data.skipped === true,
    };
  } catch (err) {
    console.error("[ocr] recognize request failed", err);
    return {
      title: "",
      category: null,
      source: "claude",
      remaining: null,
      skipped: false,
    };
  }
}
