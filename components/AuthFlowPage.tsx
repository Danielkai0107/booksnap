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
 * Full-height auth step shell.
 *
 * Mobile: title top, flex-1 form, optional after.
 * Desktop (md+): single centered card (title + form + after) in the viewport.
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
    <main className="flex min-h-dvh flex-col bg-white px-6 sm:px-10 md:items-center md:justify-center md:overflow-y-auto md:py-12">
      <div className="mx-auto flex w-full max-w-sm min-h-0 flex-1 flex-col md:min-h-0 md:flex-none md:shrink-0 md:gap-8">
        <header className="shrink-0 pt-12 text-center md:pt-0">
          <h1 className={titleClassName}>{title}</h1>
          {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:min-h-0 md:flex-none">
          {children}
        </div>

        {after ? (
          <div className="shrink-0 pb-8 text-center md:pb-0 md:pt-6">
            {after}
          </div>
        ) : null}
      </div>
    </main>
  );
}
