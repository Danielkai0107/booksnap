"use client";

import type { FormHTMLAttributes, ReactNode } from "react";

type Props = FormHTMLAttributes<HTMLFormElement> & {
  children: ReactNode;
  footer: ReactNode;
  /**
   * `center` — OTP / 短表單，內容在剩餘高度內垂直水平置中。
   * `scroll` — 長表單，欄位間距 space-y-4。
   */
  middle?: "center" | "scroll";
};

/**
 * Auth step form shell. Pair with `AuthFlowPage` for title + subtitle.
 *
 * Mobile: flex-1 middle + fixed bottom footer.
 * Desktop: natural document flow under the title (footer not fixed).
 */
export default function AuthStepForm({
  children,
  footer,
  middle = "center",
  className,
  ...formProps
}: Props) {
  const sectionClass =
    "flex min-h-0 flex-1 flex-col overflow-y-auto pb-44 md:flex-none md:overflow-visible md:pb-0 md:pt-8";

  const innerClass =
    middle === "center"
      ? "my-auto flex w-full flex-col items-center md:my-0"
      : "my-auto flex w-full flex-col space-y-4 md:my-0";

  return (
    <form
      {...formProps}
      className={`flex min-h-0 flex-1 flex-col md:flex-none ${className ?? ""}`}
    >
      <section className={sectionClass}>
        <div className={innerClass}>{children}</div>
      </section>

      <footer
        className="fixed inset-x-0 bottom-0 z-10 bg-white px-6 pt-4 pb-[max(env(safe-area-inset-bottom),16px)] md:static md:z-auto md:bg-transparent md:px-0 md:pt-12 md:pb-0"
      >
        <div className="mx-auto w-full max-w-sm">{footer}</div>
      </footer>
    </form>
  );
}
