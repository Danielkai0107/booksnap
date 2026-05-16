export type LabelSizeId = "40x30" | "30x20";
export type LabelPrintMode = "thermal" | "a4";

export const LABEL_SIZE_STORAGE_KEY = "booksnap-label-size";
export const LABEL_PRINT_MODE_STORAGE_KEY = "booksnap-label-print-mode";

export const LABEL_SIZES: Record<
  LabelSizeId,
  { widthMm: number; heightMm: number; label: string }
> = {
  "40x30": { widthMm: 40, heightMm: 30, label: "40×30 mm" },
  "30x20": { widthMm: 30, heightMm: 20, label: "30×20 mm" },
};

export const LABEL_PRINT_MODES: Record<
  LabelPrintMode,
  { label: string; hint: string }
> = {
  thermal: {
    label: "熱感單張",
    hint: "請選與貼紙相同規格（40×30 或 30×20 mm）",
  },
  a4: {
    label: "A4 拼版",
    hint: "多張標籤排在同一張 A4，適合一般印表機後裁切",
  },
};

export const LABEL_SIZE_IDS = Object.keys(LABEL_SIZES) as LabelSizeId[];
export const LABEL_PRINT_MODE_IDS = Object.keys(
  LABEL_PRINT_MODES,
) as LabelPrintMode[];

/** A4 可列印區（扣 10 mm 邊界） */
const A4_PRINTABLE_W_MM = 190;
const A4_PRINTABLE_H_MM = 277;
const A4_GRID_GAP_MM = 3;

export function isLabelSizeId(value: string): value is LabelSizeId {
  return value === "40x30" || value === "30x20";
}

export function isLabelPrintMode(value: string): value is LabelPrintMode {
  return value === "thermal" || value === "a4";
}

export function readStoredLabelSize(): LabelSizeId {
  if (typeof window === "undefined") return "40x30";
  const raw = localStorage.getItem(LABEL_SIZE_STORAGE_KEY);
  return raw && isLabelSizeId(raw) ? raw : "40x30";
}

export function readStoredLabelPrintMode(): LabelPrintMode {
  if (typeof window === "undefined") return "thermal";
  const raw = localStorage.getItem(LABEL_PRINT_MODE_STORAGE_KEY);
  return raw && isLabelPrintMode(raw) ? raw : "thermal";
}

export function storeLabelSize(id: LabelSizeId) {
  try {
    localStorage.setItem(LABEL_SIZE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function storeLabelPrintMode(mode: LabelPrintMode) {
  try {
    localStorage.setItem(LABEL_PRINT_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** A4 拼版：每張 A4 可排幾欄、幾列、共幾張標籤 */
export function a4GridForLabelSize(sizeId: LabelSizeId) {
  const { widthMm, heightMm } = LABEL_SIZES[sizeId];
  const gap = A4_GRID_GAP_MM;
  const cols = Math.max(
    1,
    Math.floor((A4_PRINTABLE_W_MM + gap) / (widthMm + gap)),
  );
  const rows = Math.max(
    1,
    Math.floor((A4_PRINTABLE_H_MM + gap) / (heightMm + gap)),
  );
  return { cols, rows, perPage: cols * rows, gapMm: gap };
}
