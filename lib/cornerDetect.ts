/**
 * jscanify 四角偵測 / 信心估算 / 透視校正三件套。
 *
 * 全部都是純函式，呼叫前 caller 必須已經透過 `loadJscanify` 拿到 scanner。
 * 不在這層做 loader / fallback，責任分離。
 */

import type {
  Corners,
  CornerPoint,
  JscanifyScanner,
  OpenCv,
} from "@/lib/jscanify";

/**
 * 從 canvas 偵測四角。記憶體管理：jscanify 的 contour Mat 由我們負責 delete。
 * 任何例外 / 不完整結果都回 null（由 caller 走手動調整流程）。
 */
export function detectCornersFromCanvas(
  canvas: HTMLCanvasElement,
  scanner: JscanifyScanner,
  cv: OpenCv,
): Corners | null {
  let mat: ReturnType<OpenCv["imread"]> | null = null;
  let contour: ReturnType<JscanifyScanner["findPaperContour"]> | null = null;
  try {
    mat = cv.imread(canvas);
    contour = scanner.findPaperContour(mat);
    if (!contour) return null;
    const partial = scanner.getCornerPoints(contour);
    if (
      !partial.topLeftCorner ||
      !partial.topRightCorner ||
      !partial.bottomLeftCorner ||
      !partial.bottomRightCorner
    ) {
      // jscanify 用「四象限取最遠點」決定四角，若某象限沒點就會缺角。
      return null;
    }
    return partial as Corners;
  } catch (err) {
    console.warn("[cornerDetect] detect failed", err);
    return null;
  } finally {
    try {
      contour?.delete();
    } catch {
      /* noop */
    }
    try {
      mat?.delete();
    } catch {
      /* noop */
    }
  }
}

/**
 * 三項啟發式：
 *   1. 四邊形面積佔比 0.25 ~ 0.95（太小 = 框到雜訊；太大 = 整張黑）
 *   2. 凸性（四個叉積同號）
 *   3. 寬高比 0.4 ~ 2.5（書本常見範圍，太誇張視為亂偵測）
 *
 * 任一項不過就算 low。high 才會自動 extract，low 給使用者手動微調。
 */
export function cornerConfidence(
  corners: Corners,
  canvasWidth: number,
  canvasHeight: number,
): "high" | "low" {
  const pts = orderedCorners(corners);
  const area = polygonArea(pts);
  const frameArea = canvasWidth * canvasHeight;
  if (frameArea <= 0) return "low";
  const ratio = area / frameArea;
  if (ratio < 0.25 || ratio > 0.95) return "low";

  if (!isConvex(pts)) return "low";

  const w = avgEdge(pts[0], pts[1], pts[3], pts[2]);
  const h = avgEdge(pts[0], pts[3], pts[1], pts[2]);
  if (w <= 0 || h <= 0) return "low";
  const aspect = w / h;
  if (aspect < 0.4 || aspect > 2.5) return "low";

  return "high";
}

/**
 * extractPaper wrapper：自動由 corner 邊長推算輸出寬高（保留原書比例），
 * 長邊上限 maxDim 防止巨型 canvas（手機上拍 4032x3024 容易爆 GPU 記憶體）。
 * 回傳 dataURL（JPEG），方便直接餵給 OCR + 寫到 cart。
 */
export function extractPaperDataUrl(
  source: HTMLCanvasElement | HTMLImageElement,
  corners: Corners,
  scanner: JscanifyScanner,
  opts: { maxDim?: number; quality?: number } = {},
): string | null {
  const maxDim = opts.maxDim ?? 1280;
  const quality = opts.quality ?? 0.92;

  const pts = orderedCorners(corners);
  const w = Math.max(
    1,
    Math.round(avgEdge(pts[0], pts[1], pts[3], pts[2])),
  );
  const h = Math.max(
    1,
    Math.round(avgEdge(pts[0], pts[3], pts[1], pts[2])),
  );

  let outW = w;
  let outH = h;
  if (outW > maxDim || outH > maxDim) {
    const scale = Math.min(maxDim / outW, maxDim / outH);
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));
  }

  try {
    const canvas = scanner.extractPaper(source, outW, outH, corners);
    if (!canvas) return null;
    return canvas.toDataURL("image/jpeg", quality);
  } catch (err) {
    console.warn("[cornerDetect] extractPaper failed", err);
    return null;
  }
}

// --- helpers ---

/** 把 jscanify 的 corner 物件轉成順時針順序 [TL, TR, BR, BL] 方便算面積。 */
function orderedCorners(c: Corners): [CornerPoint, CornerPoint, CornerPoint, CornerPoint] {
  return [
    c.topLeftCorner,
    c.topRightCorner,
    c.bottomRightCorner,
    c.bottomLeftCorner,
  ];
}

/** Shoelace formula。回傳絕對面積。 */
function polygonArea(
  pts: [CornerPoint, CornerPoint, CornerPoint, CornerPoint],
): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** 凸四邊形：相鄰邊的叉積全部同號（且不為 0）。 */
export function isConvex(
  pts: [CornerPoint, CornerPoint, CornerPoint, CornerPoint],
): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const dx1 = b.x - a.x;
    const dy1 = b.y - a.y;
    const dx2 = c.x - b.x;
    const dy2 = c.y - b.y;
    const cross = dx1 * dy2 - dy1 * dx2;
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return sign !== 0;
}

function dist(a: CornerPoint, b: CornerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 兩條對邊長度平均（更穩定的估算）。 */
function avgEdge(
  a1: CornerPoint,
  a2: CornerPoint,
  b1: CornerPoint,
  b2: CornerPoint,
): number {
  return (dist(a1, a2) + dist(b1, b2)) / 2;
}
