import {
  QuotaExceededError,
  isQuotaErrorPayload,
} from "./billing/clientErrors";

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
 *
 * Errors:
 *  - 402 (quota): throws `QuotaExceededError`. Caller should show the upgrade
 *    prompt and stop the scan loop.
 *  - other failures: returns empty title (legacy behaviour) so the user can
 *    still type a title manually.
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
    if (response.status === 402) {
      const data = await response.json().catch(() => ({}));
      if (isQuotaErrorPayload(data)) {
        throw new QuotaExceededError(data);
      }
    }
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
    if (err instanceof QuotaExceededError) throw err;
    console.error("[ocr] recognize request failed", err);
    return { title: "", category: null, source: "claude" };
  }
}
