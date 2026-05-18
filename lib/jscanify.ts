/**
 * 動態載入 OpenCV.js + jscanify.min.js（自架在 /vendor/jscanify/）。
 *
 * 設計重點：
 *   - 單例 Promise：多次呼叫只會載入一次，所有 caller 共享同一個 scanner
 *     實例與 cv namespace。
 *   - 用 <script> 注入而不是 dynamic import：jscanify 的 UMD 把
 *     scanner class 掛到 window.jscanify，且整個 OpenCV runtime 也
 *     是 global window.cv（WASM 一次性初始化）。走 ESM bundle 反而
 *     需要繞 polyfill，得不償失。
 *   - OpenCV 初始化是非同步的：腳本載入完 cv 物件存在，但 WASM 還
 *     沒就緒，必須等 cv.onRuntimeInitialized 才能呼叫 cv.Mat 等。
 *   - 失敗就讓 caller 自己 catch 並退化到原圖流程（沒有自動 retry）。
 */

export type CornerPoint = { x: number; y: number };

export type Corners = {
  topLeftCorner: CornerPoint;
  topRightCorner: CornerPoint;
  bottomRightCorner: CornerPoint;
  bottomLeftCorner: CornerPoint;
};

// 只列出我們會用到的 OpenCV.js / jscanify 表面，避免引入完整 .d.ts
// 拖大專案規模。其餘 API 仍可透過 cv as any 取得。
export type OpenCvMat = { delete: () => void; readonly data32S: Int32Array };

export type OpenCv = {
  Mat: new () => OpenCvMat;
  imread: (source: HTMLCanvasElement | HTMLImageElement) => OpenCvMat;
  imshow: (target: HTMLCanvasElement, mat: OpenCvMat) => void;
  onRuntimeInitialized?: () => void;
  // 其餘 OpenCV API 都是 scanner 內部使用，這層不需要型別。
};

export type JscanifyScanner = {
  findPaperContour: (mat: OpenCvMat) => OpenCvMat | null;
  getCornerPoints: (
    contour: OpenCvMat,
  ) => Partial<Corners>;
  extractPaper: (
    image: HTMLCanvasElement | HTMLImageElement,
    width: number,
    height: number,
    cornerPoints?: Corners,
  ) => HTMLCanvasElement | null;
  highlightPaper: (
    image: HTMLCanvasElement | HTMLImageElement,
    options?: { color?: string; thickness?: number },
  ) => HTMLCanvasElement;
};

export type Jscanify = {
  scanner: JscanifyScanner;
  cv: OpenCv;
};

const OPENCV_SRC = "/vendor/jscanify/opencv.js";
const JSCANIFY_SRC = "/vendor/jscanify/jscanify.min.js";

let loadPromise: Promise<Jscanify> | null = null;

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      // 已注入，但可能還在載入。簡單作法：再 query 一次拿到 script element 等它的 load。
      const el = document.getElementById(id) as HTMLScriptElement;
      if (el.dataset.loaded === "true") {
        resolve();
        return;
      }
      el.addEventListener("load", () => resolve(), { once: true });
      el.addEventListener(
        "error",
        () => reject(new Error(`failed to load ${src}`)),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`failed to load ${src}`)),
      { once: true },
    );
    document.head.appendChild(script);
  });
}

function waitForOpenCvReady(cv: OpenCv): Promise<void> {
  return new Promise((resolve) => {
    // 同一支 opencv.js 載入完，cv.Mat 不一定能直接 new —— WASM runtime
    // 通常會延後幾百 ms 才 ready。最穩的訊號是 onRuntimeInitialized。
    // 為避免訊號已經 fire 過（loadScript 之後我們才 attach），加一個
    // 「try new Mat」的 fast path。
    try {
      const probe = new cv.Mat();
      probe.delete();
      resolve();
      return;
    } catch {
      // not ready yet
    }
    cv.onRuntimeInitialized = () => resolve();
  });
}

export function loadJscanify(): Promise<Jscanify> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("jscanify requires a browser"));
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await loadScript(OPENCV_SRC, "vendor-opencv-js");
    const w = window as unknown as {
      cv?: OpenCv;
      jscanify?: new () => JscanifyScanner;
    };
    if (!w.cv) {
      throw new Error("opencv.js loaded but window.cv missing");
    }
    await waitForOpenCvReady(w.cv);
    await loadScript(JSCANIFY_SRC, "vendor-jscanify-js");
    if (!w.jscanify) {
      throw new Error("jscanify.min.js loaded but window.jscanify missing");
    }
    const scanner = new w.jscanify();
    return { scanner, cv: w.cv };
  })().catch((err) => {
    // 失敗後讓下一次嘗試重新走流程（例如使用者重整、或暫時的網路問題）。
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}
