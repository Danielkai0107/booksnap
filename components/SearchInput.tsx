"use client";

import { forwardRef, useId } from "react";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** input 樣式（高度、圓角、邊框等都由呼叫端決定，方便沿用既有設計）。 */
  className?: string;
  /** 外層相對定位容器的 className，例如 layout 需要的 `flex-1 min-w-0`。 */
  wrapperClassName?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** 預設 "text"，視需求可改 "search"。 */
  type?: "text" | "search";
  /** aria 與 form 提交相關 */
  name?: string;
  id?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  /** 清除按鈕點擊後是否自動 focus 回 input。預設 true。 */
  focusOnClear?: boolean;
};

/**
 * 帶清除按鈕的受控搜尋輸入框。
 * 有值時右側出現圓形 X，點擊呼叫 onValueChange("") 並把焦點還給 input。
 */
const SearchInput = forwardRef<HTMLInputElement, Props>(function SearchInput(
  {
    value,
    onValueChange,
    placeholder,
    className = "",
    wrapperClassName = "",
    autoFocus,
    disabled,
    type = "text",
    name,
    id,
    inputMode,
    focusOnClear = true,
  },
  ref,
) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const hasValue = value.length > 0;

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={ref}
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        inputMode={inputMode}
        className={`${className} ${hasValue ? "pr-10" : ""}`}
      />
      {hasValue && !disabled && (
        <button
          type="button"
          aria-label="清除搜尋"
          onClick={() => {
            onValueChange("");
            if (focusOnClear) {
              const el = document.getElementById(inputId);
              if (el instanceof HTMLInputElement) el.focus();
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 hover:text-neutral-800 flex items-center justify-center transition"
        >
          <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 1L13 13M13 1L1 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
});

export default SearchInput;
