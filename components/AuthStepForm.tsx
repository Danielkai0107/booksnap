"use client";

import type { FormHTMLAttributes, ReactNode } from "react";

type Props = FormHTMLAttributes<HTMLFormElement> & {
  children: ReactNode;
  footer: ReactNode;
  /**
   * `center` — OTP / 短表單，內容水平置中。
   * `scroll` — 長表單，欄位間距 space-y-4。
   */
  middle?: "center" | "scroll";
};

/**
 * Auth step form shell。與 `AuthFlowPage` 搭配；手機／桌面皆為自然流排版（無固定底欄）。
 */
export default function AuthStepForm({
  children,
  footer,
  middle = "center",
  className,
  ...formProps
}: Props) {
  const innerClass =
    middle === "center"
      ? "flex w-full flex-col items-center"
      : "flex w-full flex-col space-y-4";

  return (
    <form
      {...formProps}
      className={`flex w-full flex-col ${className ?? ""}`}
    >
      <section className={innerClass}>{children}</section>

      <footer className="pt-8">{footer}</footer>
    </form>
  );
}
