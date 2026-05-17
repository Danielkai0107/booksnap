"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** API 僅接受 yyyy-mm-dd */
  min?: string;
  max?: string;
};

const defaultMin = "1900-01-01";
const defaultMax = "2099-12-31";

/**
 * 原生 type="date"，外層 grid + globals.css `.date-input` 限制寬度。
 * lang="en" 讓 iOS 優先顯示較短的 yyyy-mm-dd，避免「2025年10月11日」撐破欄位。
 */
export default function NativeDateInput({
  value,
  onChange,
  disabled = false,
  className = "",
  min = defaultMin,
  max = defaultMax,
}: Props) {
  return (
    <div className="date-input-wrap">
      <input
        type="date"
        lang="en"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        min={min}
        max={max}
        className={`date-input ${className}`.trim()}
      />
    </div>
  );
}
