"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

type Props = {
  bookId: string;
  title: string;
  className?: string;
};

export default function LabelCard({ bookId, title, className = "" }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(bookId, {
      margin: 1,
      width: 220,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    })
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch((err) => console.error("[LabelCard] qr error", err));
    return () => {
      alive = false;
    };
  }, [bookId]);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, bookId, {
        format: "CODE128",
        width: 1.6,
        height: 50,
        fontSize: 12,
        margin: 0,
        background: "#ffffff",
        lineColor: "#0a0a0a",
        displayValue: true,
      });
    } catch (err) {
      console.error("[LabelCard] barcode error", err);
    }
  }, [bookId]);

  return (
    <div
      className={`print-label bg-white border border-neutral-200 rounded-xl p-5 flex flex-col items-center text-center break-inside-avoid ${className}`}
    >
      <p className="font-medium text-sm text-neutral-900 mb-3 line-clamp-2 min-h-[2.5em]">
        {title}
      </p>
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="qr" className="w-28 h-28 mb-2" />
      ) : (
        <div className="w-28 h-28 mb-2 bg-neutral-50" />
      )}
      <svg ref={svgRef} className="w-full max-w-[200px]" />
    </div>
  );
}
