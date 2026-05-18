/**
 * 客戶端影像壓縮（給 OCR 用）。
 *
 * Claude vision 按 (width × height) / 750 計算 input tokens；
 * 1280×960 大約 1600 tokens，壓到 768×576 只剩 ~590 tokens（省 64%）。
 * 對書封 OCR 來說 768px 足夠清晰，再小就會傷到中文小字辨識率。
 *
 * 品質維持 0.85：token 計算只看尺寸不看 quality，所以提升 quality 是
 * 「免費」的辨識率優化。Q0.7 在中文筆畫多的字（鬱、龍、靈）邊緣會出現
 * JPEG ringing artifacts；Q0.85 幾乎無 artifact，對藝術字體 / 童書封面
 * 改善尤其明顯。檔案大小增加 ~30%（base64 上行多幾十 KB），可忽略。
 */
export type CompressOptions = {
  /** 長邊上限（px），預設 768。 */
  maxDimension?: number;
  /** JPEG 品質 0~1，預設 0.85。 */
  quality?: number;
};

export async function compressImageDataUrl(
  dataUrl: string,
  opts: CompressOptions = {},
): Promise<string> {
  const maxDim = opts.maxDimension ?? 768;
  const quality = opts.quality ?? 0.85;

  const img = await loadImage(dataUrl);
  const { width: srcW, height: srcH } = img;
  // 已經夠小就不重壓，避免二次失真。
  if (srcW <= maxDim && srcH <= maxDim) {
    return dataUrl;
  }

  const scale = Math.min(maxDim / srcW, maxDim / srcH);
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, dstW, dstH);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
