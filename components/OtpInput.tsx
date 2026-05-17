"use client";

import { useId, useRef, useState } from "react";

type Props = {
  /** Form field name (e.g. `token`). Omit for controlled-only usage. */
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Minimum number of digit boxes shown. */
  length?: number;
  /** Max digits (paste / SMS autofill may exceed `length`). */
  maxLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  id?: string;
};

/**
 * Six-box OTP UI with a single transparent input on top so mobile browsers
 * offer the numeric keypad and `autocomplete="one-time-code"` / SMS autofill.
 */
export default function OtpInput({
  name,
  value: controlledValue,
  defaultValue = "",
  onChange,
  length = 6,
  maxLength = 10,
  disabled,
  autoFocus,
  required,
  id: idProp,
}: Props) {
  const [internal, setInternal] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internal;
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const id = idProp ?? generatedId;

  const slotCount = Math.min(maxLength, Math.max(length, value.length));

  function setValue(next: string) {
    const cleaned = next.replace(/\D/g, "").slice(0, maxLength);
    if (!isControlled) setInternal(cleaned);
    onChange?.(cleaned);
  }

  return (
    <div
      className="relative mx-auto w-fit max-w-full"
      onClick={() => !disabled && inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        enterKeyHint="done"
        autoFocus={autoFocus}
        disabled={disabled}
        required={required}
        value={value}
        maxLength={maxLength}
        pattern={maxLength === length ? `[0-9]{${length}}` : `[0-9]{${length},${maxLength}}`}
        onChange={(e) => setValue(e.target.value)}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-[0.02] caret-transparent"
        aria-label="驗證碼"
      />
      <div
        className="flex justify-center gap-2"
        aria-hidden
      >
        {Array.from({ length: slotCount }, (_, i) => {
          const digit = value[i] ?? "";
          const isActive = i === value.length;
          return (
            <div
              key={i}
              className={`flex h-12 w-11 items-center justify-center rounded-lg border bg-white font-mono text-xl text-neutral-900 transition ${
                isActive
                  ? "border-neutral-900 ring-1 ring-neutral-900"
                  : digit
                    ? "border-neutral-300"
                    : "border-neutral-200"
              }`}
            >
              {digit}
            </div>
          );
        })}
      </div>
    </div>
  );
}
