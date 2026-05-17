"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** 套在可見外框（與其他 text input 同款） */
  className?: string;
  placeholder?: string;
  min?: string;
  max?: string;
};

const defaultMin = "1900-01-01";
const defaultMax = "2099-12-31";

/** yyyy-mm-dd → yyyy/mm/dd（固定寬度、不跟 iOS 本地化走） */
function formatDisplay(iso: string): string {
  const trimmed = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "";
  const [y, m, d] = trimmed.split("-");
  return `${y}/${m}/${d}`;
}

/**
 * 可見「假輸入框」顯示日期；透明原生 type="date" 覆蓋整欄可點，開系統選日器。
 * 避免 iOS 把「2025年10月11日」畫在可見欄位裡撐破版面。
 */
export default function NativeDateInput({
  value,
  onChange,
  disabled = false,
  className = "",
  placeholder = "選擇日期",
  min = defaultMin,
  max = defaultMax,
}: Props) {
  const display = value.trim() ? formatDisplay(value) : "";
  const showPlaceholder = !display;

  return (
    <div className="date-input-shell">
      <div
        className={`date-input-facade pointer-events-none flex items-center justify-between gap-2 ${className} ${
          disabled ? "opacity-60" : ""
        }`}
        aria-hidden
      >
        <span
          className={`min-w-0 truncate ${showPlaceholder ? "text-neutral-400" : "text-neutral-900"}`}
        >
          {showPlaceholder ? placeholder : display}
        </span>
        <CalendarIcon className="shrink-0 text-neutral-400" />
      </div>

      <input
        type="date"
        lang="en"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        min={min}
        max={max}
        className="date-input-native"
        aria-label={placeholder}
      />
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
