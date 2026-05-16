import { LABEL_SIZES, type LabelSizeId } from "@/lib/labelSizes";

/** 203 dpi 熱感機常見解析度（8 dots/mm） */
export const ZPL_DPMM = 8;

export type LabelZplInput = {
  bookId: string;
  title: string;
  slug: string;
  orgName?: string | null;
  size: LabelSizeId;
  origin: string;
};

function mmToDots(mm: number) {
  return Math.round(mm * ZPL_DPMM);
}

function escapeZplText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\^/g, "").replace(/~/g, "\\7e");
}

function truncate(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function buildQrUrl(input: LabelZplInput) {
  return `${input.origin}/o/${encodeURIComponent(input.slug)}/b/${encodeURIComponent(input.bookId)}`;
}

/** 單張標籤 ZPL（^XA … ^XZ），適用 Zebra / 相容熱感機，203 dpi */
export function buildLabelZpl(input: LabelZplInput): string {
  const { widthMm, heightMm } = LABEL_SIZES[input.size];
  const pw = mmToDots(widthMm);
  const ll = mmToDots(heightMm);
  const url = buildQrUrl(input);
  const org = input.orgName ? escapeZplText(truncate(input.orgName, 28)) : "";
  const title = escapeZplText(truncate(input.title, input.size === "40x30" ? 48 : 32));
  const bookId = escapeZplText(input.bookId);

  if (input.size === "40x30") {
    const lines: string[] = [
      "^XA",
      "^CI28",
      `^PW${pw}`,
      `^LL${ll}`,
      "^LH0,0",
    ];
    if (org) {
      lines.push(`^FO8,6^FB${pw - 16},1,0,C^A0N,14,12^FD${org}^FS`);
    }
    lines.push(
      "^FO8,24^BQN,2,4^FDLA," + url + "^FS",
      `^FO108,28^FB${pw - 116},3,0,L^A0N,16,14^FD${title}^FS`,
      "^FO12,168^BY1,2,60",
      `^BCN,48,Y,N,N^FD${bookId}^FS`,
      "^XZ",
    );
    return lines.join("\n");
  }

  const lines: string[] = [
    "^XA",
    "^CI28",
    `^PW${pw}`,
    `^LL${ll}`,
    "^LH0,0",
  ];
  if (org) {
    lines.push(`^FO6,4^FB${pw - 12},1,0,C^A0N,12,10^FD${org}^FS`);
  }
  lines.push(
    "^FO6,18^BQN,2,3^FDLA," + url + "^FS",
    `^FO82,20^FB${pw - 88},2,0,L^A0N,14,12^FD${title}^FS`,
    "^FO8,108^BY1,2,40",
    `^BCN,32,Y,N,N^FD${bookId}^FS`,
    "^XZ",
  );
  return lines.join("\n");
}

/** 批次標籤：每張標籤一段 ^XA…^XZ，可直接送印表機或存成 .zpl */
export function buildLabelsZplBatch(inputs: LabelZplInput[]): string {
  if (inputs.length === 0) return "";
  const header = "; BookSnap labels — 203 dpi (8 dpmm). Zebra / ZPL compatible.\n";
  return header + inputs.map(buildLabelZpl).join("\n");
}

export function downloadTextFile(
  content: string,
  filename: string,
  mime = "text/plain;charset=utf-8",
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
