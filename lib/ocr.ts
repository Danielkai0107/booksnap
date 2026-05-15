export type RecognizeResult = {
  title: string;
  category: string | null;
  source: "claude" | "tesseract";
};

/**
 * Recognize a book cover title (and optionally a category) from a base64 image.
 *
 * Default engine: Anthropic Claude vision (高準確率，對中文書封表現最佳)。
 * 若提供 `categories`，Claude 會從清單中挑選最合適的分類。
 * 失敗時不再 fallback 到 Tesseract，避免拖慢使用者體驗；
 * 改為回傳空字串讓使用者手動輸入。
 */
export async function recognizeBookCover(
  imageBase64: string,
  categories?: string[]
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
      return { title: "", category: null, source: "claude" };
    }
    const data = (await response.json()) as {
      title?: string;
      category?: string | null;
      source?: "claude" | "tesseract";
    };
    const title = (data.title ?? "").trim();
    return {
      title: title === "無法識別" ? "" : title,
      category: data.category ?? null,
      source: data.source ?? "claude",
    };
  } catch (err) {
    console.error("[ocr] recognize request failed", err);
    return { title: "", category: null, source: "claude" };
  }
}
