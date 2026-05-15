import Tesseract from "tesseract.js";

export type RecognizeResult = {
  title: string;
  source: "tesseract" | "claude";
};

const CONFIDENCE_THRESHOLD = 70;

function cleanTitle(raw: string): string {
  // Take first non-empty line, strip extra whitespace, limit length
  const firstLine = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "";
  return firstLine.slice(0, 40);
}

export async function recognizeBookCover(
  imageBase64: string
): Promise<RecognizeResult> {
  let tessTitle = "";
  let confidence = 0;
  try {
    const result = await Tesseract.recognize(imageBase64, "chi_tra+eng");
    confidence = result.data.confidence ?? 0;
    tessTitle = cleanTitle(result.data.text ?? "");
  } catch (err) {
    console.warn("[ocr] tesseract failed, falling back to Claude", err);
  }

  if (confidence >= CONFIDENCE_THRESHOLD && tessTitle.length > 0) {
    return { title: tessTitle, source: "tesseract" };
  }

  try {
    const response = await fetch("/api/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, forceClaude: true }),
    });
    if (!response.ok) {
      throw new Error(`recognize api ${response.status}`);
    }
    const data = (await response.json()) as { title?: string };
    return { title: data.title ?? "", source: "claude" };
  } catch (err) {
    console.error("[ocr] claude fallback failed", err);
    return { title: tessTitle, source: "tesseract" };
  }
}
