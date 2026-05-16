"use client";

import {
  LABEL_PRINT_MODE_IDS,
  LABEL_PRINT_MODES,
  LABEL_SIZE_IDS,
  LABEL_SIZES,
  type LabelPrintMode,
  type LabelSizeId,
} from "@/lib/labelSizes";

type SegmentProps<T extends string> = {
  "aria-label": string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  className?: string;
};

function Segment<T extends string>({
  "aria-label": ariaLabel,
  value,
  onChange,
  options,
  className = "",
}: SegmentProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-50 ${className}`.trim()}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={`press-feedback px-3 py-1.5 text-xs font-medium rounded-md transition ${
              active
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

type Props = {
  size: LabelSizeId;
  printMode: LabelPrintMode;
  onSizeChange: (id: LabelSizeId) => void;
  onPrintModeChange: (mode: LabelPrintMode) => void;
  className?: string;
};

/** 標籤貼紙尺寸 + 列印方式（熱感單張 / A4 拼版） */
export default function LabelPrintOptions({
  size,
  printMode,
  onSizeChange,
  onPrintModeChange,
  className = "",
}: Props) {
  return (
    <div
      className={`no-print flex flex-col sm:flex-row flex-wrap gap-2 ${className}`.trim()}
    >
      <Segment
        aria-label="標籤尺寸"
        value={size}
        onChange={onSizeChange}
        options={LABEL_SIZE_IDS.map((id) => ({
          id,
          label: LABEL_SIZES[id].label,
        }))}
      />
      <Segment
        aria-label="列印方式"
        value={printMode}
        onChange={onPrintModeChange}
        options={LABEL_PRINT_MODE_IDS.map((id) => ({
          id,
          label: LABEL_PRINT_MODES[id].label,
        }))}
      />
    </div>
  );
}
