"use client";

import { useEffect } from "react";
import {
  LABEL_SIZES,
  type LabelPrintMode,
  type LabelSizeId,
} from "@/lib/labelSizes";

const STYLE_ID = "booksnap-label-print-page";

/** 依列印模式注入 `@page`（熱感單張 or A4 拼版） */
export function useLabelPrintPageSize(
  sizeId: LabelSizeId,
  printMode: LabelPrintMode,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    if (printMode === "a4") {
      el.textContent = `@page { size: A4 portrait; margin: 10mm; }`;
    } else {
      const { widthMm, heightMm } = LABEL_SIZES[sizeId];
      el.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`;
    }
    return () => {
      el?.remove();
    };
  }, [sizeId, printMode, enabled]);
}
