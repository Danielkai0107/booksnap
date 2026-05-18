/**
 * 書封四角偵測 / 透視校正。
 *
 * jscanify 內建的 findPaperContour 只是「取面積最大的 contour」，沒做形狀
 * 篩選，背景一有干擾就抓錯。這層改成自己跑 OpenCV pipeline，明確找
 * 「四邊形 + 接近畫面中心 + 不貼邊」的書封型輪廓。extractPaper 透視校正
 * 那段仍走 jscanify 的 helper（純包裝 cv.getPerspectiveTransform）。
 */

import type {
  Corners,
  CornerPoint,
  JscanifyScanner,
  OpenCv,
} from "@/lib/jscanify";

// OpenCv 完整介面太大，我們只列用到的；其他用 unknown 收尾，呼叫時必要時 cast。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvMat = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvMatVector = any;

type CvFull = OpenCv & {
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  GaussianBlur: (
    src: CvMat,
    dst: CvMat,
    ksize: { width: number; height: number },
    sigmaX: number,
    sigmaY?: number,
    borderType?: number,
  ) => void;
  Canny: (
    src: CvMat,
    dst: CvMat,
    threshold1: number,
    threshold2: number,
  ) => void;
  dilate: (src: CvMat, dst: CvMat, kernel: CvMat) => void;
  morphologyEx: (
    src: CvMat,
    dst: CvMat,
    op: number,
    kernel: CvMat,
  ) => void;
  findContours: (
    src: CvMat,
    contours: CvMatVector,
    hierarchy: CvMat,
    mode: number,
    method: number,
  ) => void;
  contourArea: (contour: CvMat) => number;
  arcLength: (curve: CvMat, closed: boolean) => number;
  approxPolyDP: (
    curve: CvMat,
    approxCurve: CvMat,
    epsilon: number,
    closed: boolean,
  ) => void;
  isContourConvex: (contour: CvMat) => boolean;
  Size: new (w: number, h: number) => { width: number; height: number };
  MatVector: new () => CvMatVector;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Mat: any;
  COLOR_RGBA2GRAY: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  MORPH_CLOSE: number;
  CV_8U: number;
};

type Candidate = {
  corners: Corners;
  area: number;
  score: number;
};

/**
 * 從 canvas 偵測書封四角。
 *
 * Pipeline：
 *   1. 灰階 → 5×5 高斯模糊（壓掉文字 / 紋理噪點）
 *   2. Canny 50/150（書封硬邊適中閾值）
 *   3. 3×3 dilate → 接起書封邊上斷掉的小縫
 *   4. RETR_EXTERNAL 抓最外層輪廓（過濾內部文字 / 插圖）
 *   5. 每個輪廓跑 approxPolyDP 簡化 → 只留剛好 4 個頂點且凸的
 *   6. 排除：面積 < 5% 或 > 95%、任一角貼邊（< 1.5% 邊距）
 *      → 桌面 / 整張底色這類「假大框」會被擋掉
 *   7. 候選依分數排序：area × 中心度 × aspect 加權
 *
 * 任一例外或無候選 → 回 null（由 caller 顯示預設內縮矩形讓使用者拉）。
 */
export function detectCornersFromCanvas(
  canvas: HTMLCanvasElement,
  cv: OpenCv,
): Corners | null {
  const cvf = cv as CvFull;
  let src: CvMat | null = null;
  let gray: CvMat | null = null;
  let blurred: CvMat | null = null;
  let edges: CvMat | null = null;
  let closed: CvMat | null = null;
  let kernel: CvMat | null = null;
  let contours: CvMatVector | null = null;
  let hierarchy: CvMat | null = null;

  try {
    src = cv.imread(canvas);
    gray = new cvf.Mat();
    cvf.cvtColor(src, gray, cvf.COLOR_RGBA2GRAY);

    blurred = new cvf.Mat();
    cvf.GaussianBlur(gray, blurred, new cvf.Size(5, 5), 0);

    edges = new cvf.Mat();
    cvf.Canny(blurred, edges, 50, 150);

    // 3×3 dilate＋close 把斷邊接起來，效果比單純 dilate 好（不會把背景紋理連成一片）。
    kernel = cvf.Mat.ones(3, 3, cvf.CV_8U);
    closed = new cvf.Mat();
    cvf.morphologyEx(edges, closed, cvf.MORPH_CLOSE, kernel);

    contours = new cvf.MatVector();
    hierarchy = new cvf.Mat();
    cvf.findContours(
      closed,
      contours,
      hierarchy,
      cvf.RETR_EXTERNAL,
      cvf.CHAIN_APPROX_SIMPLE,
    );

    const W = canvas.width;
    const H = canvas.height;
    const imgArea = W * H;
    const minArea = imgArea * 0.05;
    const maxArea = imgArea * 0.95;
    const edgeMargin = Math.min(W, H) * 0.015;

    const candidates: Candidate[] = [];
    const n = contours.size();
    for (let i = 0; i < n; i++) {
      const cnt = contours.get(i);
      const area = cvf.contourArea(cnt);
      if (area < minArea || area > maxArea) {
        cnt.delete();
        continue;
      }
      const peri = cvf.arcLength(cnt, true);
      const approx = new cvf.Mat();
      // epsilon = 2% 邊長：書封通常有清楚直邊，這個 ε 能穩定簡化成 4 點。
      cvf.approxPolyDP(cnt, approx, 0.02 * peri, true);

      if (approx.rows === 4 && cvf.isContourConvex(approx)) {
        const pts = readQuad(approx);
        // 排除「整張畫面四個角」這種桌面 / 背景假框
        const touchesEdge = pts.some(
          (p) =>
            p.x < edgeMargin ||
            p.y < edgeMargin ||
            p.x > W - edgeMargin ||
            p.y > H - edgeMargin,
        );
        if (!touchesEdge) {
          const corners = orderQuad(pts);
          candidates.push({
            corners,
            area,
            score: scoreCandidate(corners, area, W, H),
          });
        }
      }

      approx.delete();
      cnt.delete();
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].corners;
  } catch (err) {
    console.warn("[cornerDetect] detect failed", err);
    return null;
  } finally {
    src?.delete();
    gray?.delete();
    blurred?.delete();
    edges?.delete();
    closed?.delete();
    kernel?.delete();
    contours?.delete();
    hierarchy?.delete();
  }
}

/**
 * extractPaper wrapper：自動由 corner 邊長推算輸出寬高（保留原書比例），
 * 長邊上限 maxDim 防止巨型 canvas（手機上拍 4032×3024 容易爆 GPU 記憶體）。
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

// --- candidate scoring ---

/**
 * 三項加權平均：
 *   - area（線性）：越大越像主體，但已被 minArea / maxArea 卡住範圍
 *   - centerScore：四邊形重心離畫面中心越近分數越高（避免抓到邊上小東西）
 *   - aspectScore：寬高比靠近 0.65（一般書封 2:3）的給滿分；極端比例壓分
 */
function scoreCandidate(
  corners: Corners,
  area: number,
  W: number,
  H: number,
): number {
  const pts = orderedCorners(corners);
  const centroid = {
    x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4,
    y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4,
  };
  const cx = W / 2;
  const cy = H / 2;
  const maxD = Math.hypot(cx, cy);
  const centerDist = Math.hypot(centroid.x - cx, centroid.y - cy);
  const centerScore = 1 - centerDist / maxD;

  const w = avgEdge(pts[0], pts[1], pts[3], pts[2]);
  const h = avgEdge(pts[0], pts[3], pts[1], pts[2]);
  const aspect = w > 0 && h > 0 ? Math.min(w, h) / Math.max(w, h) : 0;
  // 書封多在 0.6~0.75 區間；其他奇怪比例給較低分但不歸零。
  const aspectScore = 1 - Math.min(1, Math.abs(aspect - 0.67) * 2.5);

  return area * (0.5 + 0.5 * centerScore) * (0.5 + 0.5 * aspectScore);
}

// --- 通用 helpers ---

/** 從 4 點 cv.Mat 取出 {x, y} 陣列。Mat 的 data32S 是 [x0, y0, x1, y1, ...]。 */
function readQuad(approx: CvMat): CornerPoint[] {
  const data = approx.data32S as Int32Array;
  return [
    { x: data[0], y: data[1] },
    { x: data[2], y: data[3] },
    { x: data[4], y: data[5] },
    { x: data[6], y: data[7] },
  ];
}

/** approxPolyDP 出來的 4 點順序不確定 → 依重心象限分到 TL/TR/BR/BL。 */
function orderQuad(pts: CornerPoint[]): Corners {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let tl: CornerPoint = pts[0];
  let tr: CornerPoint = pts[0];
  let br: CornerPoint = pts[0];
  let bl: CornerPoint = pts[0];
  for (const p of pts) {
    if (p.x <= cx && p.y <= cy) tl = p;
    else if (p.x > cx && p.y <= cy) tr = p;
    else if (p.x > cx && p.y > cy) br = p;
    else bl = p;
  }
  return {
    topLeftCorner: tl,
    topRightCorner: tr,
    bottomRightCorner: br,
    bottomLeftCorner: bl,
  };
}

/** 把 corner 物件轉成順時針順序 [TL, TR, BR, BL] 方便算面積 / 邊長。 */
function orderedCorners(
  c: Corners,
): [CornerPoint, CornerPoint, CornerPoint, CornerPoint] {
  return [
    c.topLeftCorner,
    c.topRightCorner,
    c.bottomRightCorner,
    c.bottomLeftCorner,
  ];
}

/** 凸四邊形：相鄰邊的叉積全部同號（且不為 0）。給 adjuster 套用前檢查用。 */
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
