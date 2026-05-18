"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isConvex } from "@/lib/cornerDetect";
import type { Corners, CornerPoint } from "@/lib/jscanify";

type CornerKey =
  | "topLeftCorner"
  | "topRightCorner"
  | "bottomRightCorner"
  | "bottomLeftCorner";

const CORNER_ORDER: CornerKey[] = [
  "topLeftCorner",
  "topRightCorner",
  "bottomRightCorner",
  "bottomLeftCorner",
];

/** 放大鏡直徑（px）。CSS 也用這個常數，保持兩邊同步。 */
const LOUPE_SIZE = 128;

/**
 * 四角拖曳可達的「最大範圍」— 從圖片每一邊內縮的百分比。
 * 在 `clientToImage` clamp 時使用，防止 handle 被拖到極端邊緣導致
 * 觸控目標被螢幕邊切掉、或四角擠成退化形狀（凹/共線）。
 *
 * 0.02 表示每邊內縮 2%（corner 可達 [2%, 98%]）。
 */
const MAX_RANGE_INSET_PERCENT = 0.02;

type Props = {
  /** 原始拍下的圖（dataURL 或 blob URL）。 */
  imageDataUrl: string;
  /** 圖片原始尺寸（用來把 SVG 座標映回真實 pixel）。 */
  imageWidth: number;
  imageHeight: number;
  /** 自動偵測結果；沒有就用預設內縮矩形。 */
  initialCorners?: Corners | null;
  onCancel: () => void;
  onConfirm: (corners: Corners) => void;
};

/**
 * 手動四點調整覆蓋層。
 *
 * - 圖片用 `object-contain` 佔滿可用空間，SVG overlay 跟著圖片實際渲染
 *   區域同尺寸（letterbox 留白不接收事件）。
 * - Handle 視覺 16px、觸控目標 44px（透明擴大），符合 iOS HIG。
 * - 拖曳時 clamp 在 `MAX_RANGE_INSET_PERCENT` 內縮後的安全範圍內，且
 *   即時用 isConvex 驗證；非凸 quad 時確認按鈕 disable，避免送出沒用
 *   的 corner 給 warpPerspective。
 */
export default function DocumentCornerAdjuster({
  imageDataUrl,
  imageWidth,
  imageHeight,
  initialCorners,
  onCancel,
  onConfirm,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 圖片實際渲染區域（object-contain 後的內框，扣除 letterbox）。
  const [renderBox, setRenderBox] = useState<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // corners 永遠以「原圖 pixel 座標」存（送出時不用換算）。
  // 自動偵測結果直接採用；拖曳時 `clientToImage` 已經 clamp 在安全範圍，
  // 不在 init 階段做合理性驗證（避免合理偵測結果被誤判成「越界」整組打回預設）。
  const [corners, setCorners] = useState<Corners>(() =>
    initialCorners ?? defaultCorners(imageWidth, imageHeight),
  );
  const [draggingKey, setDraggingKey] = useState<CornerKey | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateRenderBox());
    ro.observe(el);
    updateRenderBox();
    return () => ro.disconnect();
    function updateRenderBox() {
      const node = containerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const box = fitContain(
        imageWidth,
        imageHeight,
        rect.width,
        rect.height,
      );
      setRenderBox(box);
    }
  }, [imageWidth, imageHeight]);

  // 阻擋 iOS Safari 的邊緣 swipe-back（很容易在拉左/右側四角時誤觸返回上一頁）。
  // 對左右各 24px 邊緣內起手的 touchstart 直接 preventDefault；中央區域不受
  // 影響，pointer-events 流程照舊。listener 必須 non-passive 才能 preventDefault。
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const x = t.clientX;
      if (x < 24 || x > window.innerWidth - 24) {
        e.preventDefault();
      }
    };
    document.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => document.removeEventListener("touchstart", onTouchStart);
  }, []);

  /** 把容器內的 client 座標映到原圖 pixel。 */
  const clientToImage = useCallback(
    (clientX: number, clientY: number): CornerPoint | null => {
      const node = containerRef.current;
      if (!node || !renderBox) return null;
      const rect = node.getBoundingClientRect();
      const x = clientX - rect.left - renderBox.offsetX;
      const y = clientY - rect.top - renderBox.offsetY;
      const sx = imageWidth / renderBox.width;
      const sy = imageHeight / renderBox.height;
      // 限縮在圖片內側 MAX_RANGE_INSET_PERCENT 的範圍內，避免拖到極端
      // 邊緣，handle 被切掉或四角退化。
      const minX = imageWidth * MAX_RANGE_INSET_PERCENT;
      const maxX = imageWidth - minX;
      const minY = imageHeight * MAX_RANGE_INSET_PERCENT;
      const maxY = imageHeight - minY;
      return {
        x: clamp(x * sx, minX, maxX),
        y: clamp(y * sy, minY, maxY),
      };
    },
    [renderBox, imageWidth, imageHeight],
  );

  /** 原圖 pixel 座標 → SVG/容器 px（給 handle 與 polyline 渲染）。 */
  const imageToView = useCallback(
    (p: CornerPoint): CornerPoint => {
      if (!renderBox) return { x: 0, y: 0 };
      return {
        x: renderBox.offsetX + (p.x / imageWidth) * renderBox.width,
        y: renderBox.offsetY + (p.y / imageHeight) * renderBox.height,
      };
    },
    [renderBox, imageWidth, imageHeight],
  );

  const handlePointerDown = useCallback(
    (key: CornerKey) => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDraggingKey(key);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingKey) return;
      const next = clientToImage(e.clientX, e.clientY);
      if (!next) return;
      setCorners((prev) => ({ ...prev, [draggingKey]: next }));
    },
    [draggingKey, clientToImage],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingKey) return;
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      setDraggingKey(null);
    },
    [draggingKey],
  );

  const orderedView = useMemo(
    () => CORNER_ORDER.map((k) => imageToView(corners[k])),
    [corners, imageToView],
  );

  const orderedImagePts = useMemo(
    () =>
      [
        corners.topLeftCorner,
        corners.topRightCorner,
        corners.bottomRightCorner,
        corners.bottomLeftCorner,
      ] as [CornerPoint, CornerPoint, CornerPoint, CornerPoint],
    [corners],
  );

  const convex = useMemo(() => isConvex(orderedImagePts), [orderedImagePts]);

  // 拖曳中的那一角在「目前畫面上顯示的圖片」內的像素位置。給放大鏡用。
  const draggingCornerImagePoint = draggingKey ? corners[draggingKey] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden select-none touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={imageDataUrl}
          alt="captured"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
        {renderBox && (
          // 不指定 viewBox：SVG 內部座標直接是 CSS px，跟容器尺寸 1:1，
          // 也就是 renderBox 已經提供的座標系統。免去碰 ref.current。
          <svg className="absolute inset-0 w-full h-full">
            <polygon
              points={orderedView
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
              fill={
                convex ? "rgba(34, 197, 94, 0.18)" : "rgba(239, 68, 68, 0.18)"
              }
              stroke={convex ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {orderedView.map((p, i) => {
              const key = CORNER_ORDER[i];
              const active = draggingKey === key;
              return (
                <g key={key}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={active ? 12 : 10}
                    fill="white"
                    stroke={convex ? "#22c55e" : "#ef4444"}
                    strokeWidth={2}
                    style={{ pointerEvents: "none" }}
                  />
                  {/* 透明大圓接收觸控（44px hit-area）。 */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={22}
                    fill="transparent"
                    onPointerDown={handlePointerDown(key)}
                    style={{ cursor: "grab", touchAction: "none" }}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {/* 局部放大鏡：以「螢幕顯示尺寸」為基準的 2× 放大，置中對齊
            目前拖曳的那一角。CSS background-position 算式：
              - bgScale = renderBox.width / imageWidth × 2
              - bgSize = imageWidth × bgScale (= renderBox.width × 2)
              - bgPos.x = LOUPE_SIZE/2 − corner.x × bgScale
            這樣 corner 在原圖座標的點剛好落在放大鏡正中央。 */}
        {renderBox && draggingCornerImagePoint && imageWidth > 0 && (
          <div
            className="absolute z-10 pointer-events-none adjust-loupe"
            style={{
              top: 16,
              right: 16,
              backgroundImage: `url(${imageDataUrl})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${renderBox.width * 2}px ${renderBox.height * 2}px`,
              backgroundPosition: `${
                LOUPE_SIZE / 2 -
                (draggingCornerImagePoint.x / imageWidth) *
                  renderBox.width *
                  2
              }px ${
                LOUPE_SIZE / 2 -
                (draggingCornerImagePoint.y / imageHeight) *
                  renderBox.height *
                  2
              }px`,
            }}
            aria-hidden
          >
            {/* 中央十字準星 */}
            <span className="adjust-loupe-crosshair-h" />
            <span className="adjust-loupe-crosshair-v" />
          </div>
        )}

        {/* 提示 pill 放置中靠上，視覺風格跟相機頁一致。z-0 確保被 loupe 蓋住。 */}
        <div className="absolute top-4 inset-x-0 z-0 flex justify-center px-6 pointer-events-none">
          <p className="text-xs text-white/85 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full">
            拖曳四個點對準書封邊緣
          </p>
        </div>
      </div>

      <div className="flex gap-3 px-6 pt-3 pb-8 bg-black">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-white/10 hover:bg-white/15 text-white text-sm font-medium py-3 rounded-lg transition"
        >
          重拍
        </button>
        <button
          type="button"
          disabled={!convex}
          onClick={() => convex && onConfirm(corners)}
          className="flex-1 bg-white hover:bg-neutral-100 text-neutral-900 text-sm font-medium py-3 rounded-lg transition disabled:bg-white/30 disabled:text-white/50 disabled:cursor-not-allowed"
        >
          套用校正
        </button>
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 預設四角：在圖片內側 12% 留邊處的矩形。 */
function defaultCorners(w: number, h: number): Corners {
  const mx = w * 0.12;
  const my = h * 0.12;
  return {
    topLeftCorner: { x: mx, y: my },
    topRightCorner: { x: w - mx, y: my },
    bottomRightCorner: { x: w - mx, y: h - my },
    bottomLeftCorner: { x: mx, y: h - my },
  };
}

/** object-contain 對應的內框尺寸與 offset。 */
function fitContain(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { width: number; height: number; offsetX: number; offsetY: number } {
  if (srcW <= 0 || srcH <= 0 || boxW <= 0 || boxH <= 0) {
    return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return {
    width,
    height,
    offsetX: (boxW - width) / 2,
    offsetY: (boxH - height) / 2,
  };
}
