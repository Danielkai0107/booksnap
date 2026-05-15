"use client";

import { SelectHTMLAttributes, forwardRef } from "react";

type Option = { value: string; label: string };

type Props = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children" | "size"
> & {
  options: Option[];
  placeholder?: string;
  /** Visual sizing. `sm` for header filters, `md` for forms. */
  sizeVariant?: "sm" | "md";
};

/**
 * Cross-browser styled `<select>` with a custom chevron.
 *
 * Why: Native chevrons render differently between Chrome/Safari/Firefox and on
 * iOS Safari the default arrow can overlap long option text. We disable the
 * native arrow with `appearance-none`, then position our own SVG inside an
 * absolute box with `pointer-events-none`. The select reserves right padding
 * (`pr-9`) equal to the chevron box so the icon never overlaps the text and
 * never shifts when the value changes.
 */
const CategorySelect = forwardRef<HTMLSelectElement, Props>(function CategorySelect(
  {
    options,
    placeholder,
    sizeVariant = "md",
    className = "",
    ...rest
  },
  ref
) {
  const height = sizeVariant === "sm" ? "h-[42px]" : "h-[46px]";
  const text = sizeVariant === "sm" ? "text-sm" : "text-sm md:text-sm";
  return (
    <div className={`relative w-full ${className}`}>
      <select
        ref={ref}
        {...rest}
        className={`appearance-none w-full ${height} ${text} pl-3.5 pr-9 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900 transition disabled:bg-neutral-50 disabled:text-neutral-400 truncate`}
      >
        {placeholder !== undefined && (
          <option value="">{placeholder}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 right-0 w-9 flex items-center justify-center text-neutral-400"
        aria-hidden
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0"
        >
          <path
            d="M3 5L7 9L11 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
});

export default CategorySelect;
