"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import {
  LABEL_SIZES,
  type LabelSizeId,
} from "@/lib/labelSizes";

export type { LabelSizeId };
export const LABEL_WIDTH_MM = LABEL_SIZES["40x30"].widthMm;
export const LABEL_HEIGHT_MM = LABEL_SIZES["40x30"].heightMm;

type Props = {
  bookId: string;
  title: string;
  slug: string;
  orgName?: string | null;
  /** 熱感貼紙規格，預設 40×30 mm */
  size?: LabelSizeId;
  className?: string;
};

const QR_PX: Record<LabelSizeId, number> = {
  "40x30": 140,
  "30x20": 96,
};

const BARCODE_OPTS: Record<
  LabelSizeId,
  { height: number; fontSize: number; width: number }
> = {
  "40x30": { height: 22, fontSize: 6, width: 1 },
  "30x20": { height: 14, fontSize: 5, width: 0.85 },
};

/**
 * 書籍標籤卡（40×30 或 30×20 mm）。版面：單位名 → QR + 書名 → CODE128。
 * QR 連結 `/o/{slug}/b/{bookId}`。
 */
export default function LabelCard({
  bookId,
  title,
  slug,
  orgName,
  size = "40x30",
  className = "",
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    const target = `${origin}/o/${encodeURIComponent(slug)}/b/${encodeURIComponent(
      bookId,
    )}`;
    QRCode.toDataURL(target, {
      margin: 0,
      width: QR_PX[size],
      color: { dark: "#0a0a0a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch((err) => console.error("[LabelCard] qr error", err));
    return () => {
      alive = false;
    };
  }, [bookId, slug, size]);

  useEffect(() => {
    if (!svgRef.current) return;
    const opts = BARCODE_OPTS[size];
    try {
      JsBarcode(svgRef.current, bookId, {
        format: "CODE128",
        width: opts.width,
        height: opts.height,
        fontSize: opts.fontSize,
        margin: 0,
        background: "#ffffff",
        lineColor: "#0a0a0a",
        displayValue: true,
        textMargin: 1,
      });
    } catch (err) {
      console.error("[LabelCard] barcode error", err);
    }
  }, [bookId, size]);

  return (
    <div
      className={`print-label label-card label-size-${size} ${className}`.trim()}
    >
      {orgName ? (
        <p className="label-org" title={orgName}>
          {orgName}
        </p>
      ) : null}
      <div className="label-main">
        <div className="label-qr-wrap">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="" className="label-qr" />
          ) : (
            <div className="label-qr label-qr-placeholder" aria-hidden />
          )}
        </div>
        <p className="label-title" title={title}>
          {title}
        </p>
      </div>
      <svg ref={svgRef} className="label-barcode" aria-hidden />
    </div>
  );
}
