/**
 * 書封四角偵測 / 透視校正。
 *
 * jscanify 內建的 findPaperContour 只是「取面積最大的 contour」，沒做形狀
 * 篩選、背景一有干擾就抓錯。這層改成自己跑 OpenCV pipeline，並用多輪
 * 不同參數重試，命中率比單次 Canny 高很多：
 *
 *   Pass 1：標準 Canny 50/150（亮、對比清楚的書封）
 *   Pass 2：Otsu 二值化 → Canny（書封 / 背景顏色接近、低對比）
 *   Pass 3：寬鬆 Canny 30/120 + 大 kernel close（弱光、模糊邊）
 *   Pass 4：minAreaRect 兜底（找不到四邊形時取最大 contour 的最小外接矩形）
 *
 * extractPaper 透視校正那段仍走 jscanify（純包裝 cv 的
 * getPerspectiveTransform / warpPerspective）。
 */

import type {
  Corners,
  CornerPoint,
  JscanifyScanner,
  OpenCv,
} from "@/lib/jscanify";

// OpenCv 完整介面太大，我們只列用到的；其他用 unknown 收尾，呼叫時必要時 cast。
/* eslint-disable @typescript-eslint/no-explicit-any */
type CvMat = any;
type CvMatVector = any;
type CvRotatedRect = {
  center: { x: number; y: number };
  size: { width: number; height: number };
  angle: number;
};

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
  threshold: (
    src: CvMat,
    dst: CvMat,
    thresh: number,
    maxval: number,
    type: number,
  ) => number;
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
  minAreaRect: (contour: CvMat) => CvRotatedRect;
  Size: new (w: number, h: number) => { width: number; height: number };
  MatVector: new () => CvMatVector;
  Mat: any;
  COLOR_RGBA2GRAY: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  MORPH_CLOSE: number;
  CV_8U: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

type Candidate = {
  corners: Corners;
  area: number;
  score: number;
};

type PassParams =
  | {
      method: "canny";
      lo: number;
      hi: number;
      closeSize: number;
      epsRatio: number;
    }
  | {
      method: "otsu";
      closeSize: number;
      epsRatio: number;
    };

/**
 * 從 canvas 偵測書封四角。Caller 必須已透過 `loadJscanify` 拿到 cv namespace。
 *
 * 多輪策略：每輪用不同前處理找四邊形候選；累積到任何一個 pass 找到就停，
 * 全部沒中時用 minAreaRect 兜底。最後從所有候選中按分數最高選一個。
 *
 * 失敗 / 例外 → 回 null（caller fallback 成預設內縮矩形）。
 */
export function detectCornersFromCanvas(
  canvas: HTMLCanvasElement,
  cv: OpenCv,
): Corners | null {
  const cvf = cv as CvFull;
  let src: CvMat | null = null;
  let gray: CvMat | null = null;
  try {
    src = cv.imread(canvas);
    gray = new cvf.Mat();
    cvf.cvtColor(src, gray, cvf.COLOR_RGBA2GRAY);

    const W = canvas.width;
    const H = canvas.height;
    const all: Candidate[] = [];

    // Pass 1：標準 Canny。中等對比書封多半這輪就中。
    all.push(
      ...runContourPass(gray, cvf, W, H, {
        method: "canny",
        lo: 50,
        hi: 150,
        closeSize: 3,
        epsRatio: 0.02,
      }),
    );

    // Pass 2：Otsu 二值化後再 Canny。對「書封 / 背景顏色接近」效果好。
    if (all.length === 0) {
      all.push(
        ...runContourPass(gray, cvf, W, H, {
          method: "otsu",
          closeSize: 3,
          epsRatio: 0.02,
        }),
      );
    }

    // Pass 3：寬鬆 Canny + 大 kernel + 較鬆的 epsilon。
    // 弱光或模糊邊讓 contour 抖動成 5–6 點時還能簡化成四邊形。
    if (all.length === 0) {
      all.push(
        ...runContourPass(gray, cvf, W, H, {
          method: "canny",
          lo: 30,
          hi: 120,
          closeSize: 5,
          epsRatio: 0.035,
        }),
      );
    }

    // Pass 4：完全找不到四邊形 → 對最大 contour 取最小外接矩形（minAreaRect）。
    // 一定會回 4 點，總比讓使用者從預設內縮矩形拉好。
    if (all.length === 0) {
      const fb = runMinAreaRectFallback(gray, cvf, W, H);
      if (fb) all.push(fb);
    }

    if (all.length === 0) return null;
    all.sort((a, b) => b.score - a.score);
    return all[0].corners;
  } catch (err) {
    console.warn("[cornerDetect] detect failed", err);
    return null;
  } finally {
    src?.delete();
    gray?.delete();
  }
}

/** 單輪偵測：依參數做前處理 → 找 contour → 篩四邊形 → 評分。 */
function runContourPass(
  gray: CvMat,
  cv: CvFull,
  W: number,
  H: number,
  params: PassParams,
): Candidate[] {
  let blurred: CvMat | null = null;
  let pre: CvMat | null = null;
  let edges: CvMat | null = null;
  let closed: CvMat | null = null;
  let kernel: CvMat | null = null;
  let contours: CvMatVector | null = null;
  let hierarchy: CvMat | null = null;
  const out: Candidate[] = [];

  try {
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    edges = new cv.Mat();
    if (params.method === "canny") {
      cv.Canny(blurred, edges, params.lo, params.hi);
    } else {
      // Otsu：先二值化再 Canny 取輪廓（單純 threshold 結果直接 findContours
      // 也行，但 Canny 的單像素輪廓對 approxPolyDP 更友善）。
      pre = new cv.Mat();
      cv.threshold(
        blurred,
        pre,
        0,
        255,
        cv.THRESH_BINARY | cv.THRESH_OTSU,
      );
      cv.Canny(pre, edges, 50, 150);
    }

    kernel = cv.Mat.ones(params.closeSize, params.closeSize, cv.CV_8U);
    closed = new cv.Mat();
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      closed,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const imgArea = W * H;
    const minArea = imgArea * 0.05;
    const maxArea = imgArea * 0.96;
    const edgeMargin = Math.min(W, H) * 0.015;

    const n = contours.size();
    for (let i = 0; i < n; i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < minArea || area > maxArea) {
        cnt.delete();
        continue;
      }
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, params.epsRatio * peri, true);

      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const pts = readQuad(approx);
        const edgeCount = pts.filter(
          (p) =>
            p.x < edgeMargin ||
            p.y < edgeMargin ||
            p.x > W - edgeMargin ||
            p.y > H - edgeMargin,
        ).length;
        // 3+ 角貼邊才當作整張畫面 / 桌面外框剔除（保留只有 1-2 角壓邊
        // 的書封——書本拍滿框很常見）。
        if (edgeCount < 3) {
          const corners = orderQuad(pts);
          out.push({
            corners,
            area,
            score: scoreCandidate(corners, area, W, H),
          });
        }
      }
      approx.delete();
      cnt.delete();
    }
  } catch (err) {
    console.warn("[cornerDetect] pass failed", params, err);
  } finally {
    blurred?.delete();
    pre?.delete();
    edges?.delete();
    closed?.delete();
    kernel?.delete();
    contours?.delete();
    hierarchy?.delete();
  }
  return out;
}

/**
 * 兜底：對最大合理 contour 取 minAreaRect（一定能回 4 個點）。
 * 比讓使用者從預設內縮矩形拉強很多。
 */
function runMinAreaRectFallback(
  gray: CvMat,
  cv: CvFull,
  W: number,
  H: number,
): Candidate | null {
  let blurred: CvMat | null = null;
  let edges: CvMat | null = null;
  let closed: CvMat | null = null;
  let kernel: CvMat | null = null;
  let contours: CvMatVector | null = null;
  let hierarchy: CvMat | null = null;
  let bestCnt: CvMat | null = null;

  try {
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 30, 120);
    kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    closed = new cv.Mat();
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      closed,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const imgArea = W * H;
    let bestArea = 0;
    const n = contours.size();
    for (let i = 0; i < n; i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < imgArea * 0.05 || area > imgArea * 0.96) {
        cnt.delete();
        continue;
      }
      if (area > bestArea) {
        bestCnt?.delete();
        bestCnt = cnt;
        bestArea = area;
      } else {
        cnt.delete();
      }
    }

    if (!bestCnt) return null;
    const rect = cv.minAreaRect(bestCnt);
    const pts = rotatedRectToCorners(rect);
    const corners = orderQuad(pts);
    return {
      corners,
      area: bestArea,
      // minAreaRect 結果天生 score 給較低（×0.7）—— 真有四邊形候選優先。
      score: scoreCandidate(corners, bestArea, W, H) * 0.7,
    };
  } catch (err) {
    console.warn("[cornerDetect] minAreaRect fallback failed", err);
    return null;
  } finally {
    bestCnt?.delete();
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
 *   - area（線性）：越大越像主體
 *   - centerScore：四邊形重心離畫面中心越近分數越高（避免抓到邊上小東西）
 *   - aspectScore：寬高比靠近 0.67（一般書封 2:3）的給滿分；極端比例壓分
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
  const aspectScore = 1 - Math.min(1, Math.abs(aspect - 0.67) * 2.5);

  return area * (0.5 + 0.5 * centerScore) * (0.5 + 0.5 * aspectScore);
}

// --- 通用 helpers ---

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

/** RotatedRect → 4 個 CornerPoint。手算 cos/sin 比賭 cv.boxPoints 簽名穩。 */
function rotatedRectToCorners(rect: CvRotatedRect): CornerPoint[] {
  const cx = rect.center.x;
  const cy = rect.center.y;
  const hw = rect.size.width / 2;
  const hh = rect.size.height / 2;
  const rad = (rect.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local: CornerPoint[] = [
    { x: -hw, y: -hh },
    { x: +hw, y: -hh },
    { x: +hw, y: +hh },
    { x: -hw, y: +hh },
  ];
  return local.map((p) => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
}

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

function avgEdge(
  a1: CornerPoint,
  a2: CornerPoint,
  b1: CornerPoint,
  b2: CornerPoint,
): number {
  return (dist(a1, a2) + dist(b1, b2)) / 2;
}
