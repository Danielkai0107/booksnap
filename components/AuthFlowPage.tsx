import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Override default `text-3xl` booksnap title sizing */
  titleClassName?: string;
  subtitleClassName?: string;
  children: ReactNode;
  /** Optional row below the main column (e.g. login verify links) */
  after?: ReactNode;
};

/**
 * Full-height auth step shell — 手機與桌面同一套：視窗置中、標題 + 表單自然流排版。
 */
export default function AuthFlowPage({
  title,
  subtitle,
  titleClassName = "text-3xl font-semibold tracking-tight text-neutral-900",
  subtitleClassName = "mt-5 text-sm text-neutral-400 tracking-wide",
  children,
  after,
}: Props) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center overflow-y-auto bg-white px-6 py-12 sm:px-10">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
        <header className="shrink-0 text-center">
          <h1 className={titleClassName}>{title}</h1>
          {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
        </header>

        <div className="w-full">{children}</div>

        {after ? <div className="shrink-0 text-center">{after}</div> : null}
      </div>
    </main>
  );
}
