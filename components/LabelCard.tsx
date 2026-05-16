"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

type Props = {
  bookId: string;
  title: string;
  /**
   * Organization public slug. Embedded into the QR target URL so anonymous
   * scanners land on the correct unit's borrow / return flow even across
   * tenants with the same `book_id`.
   */
  slug: string;
  /**
   * Organization display name shown as a header above the book title. Gives
   * the printed label a clear "owned by" anchor — handy when several units
   * end up on the same shelf at a venue.
   */
  orgName?: string | null;
  className?: string;
};

/**
 * QR payload is the public deep-link URL `/o/{slug}/b/{bookId}` rather than
 * a bare `book_id`. Native phone cameras open it directly in the browser, and
 * the server-side route at `/o/{slug}/b/[bookId]` then dispatches to either
 * the borrow or return flow based on current book status.
 *
 * Error correction is bumped to "M" so a small smudge or curved spine does
 * not break decoding when the URL stretches the symbol density.
 */
export default function LabelCard({
  bookId,
  title,
  slug,
  orgName,
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
      bookId
    )}`;
    QRCode.toDataURL(target, {
      margin: 1,
      width: 260,
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
  }, [bookId, slug]);

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
      {orgName && (
        <p className="text-[11px] text-neutral-500 mb-1 line-clamp-1 w-full">
          {orgName}
        </p>
      )}
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
