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
  /** 文字標題上方的 logo 圖示路徑（public 下的相對路徑，例如 "/logo.png"）。
   *  沒傳就不渲染，避免破圖。 */
  logoSrc?: string;
  /** Logo alt 文字；無障礙用。傳空字串代表「裝飾性」（screen reader 略過）。 */
  logoAlt?: string;
  /** Logo 顯示尺寸（px）。預設 48，跟 `text-3xl` 標題在視覺上比例剛好。 */
  logoSize?: number;
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
  logoSrc,
  logoAlt = "",
  logoSize = 48,
}: Props) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center overflow-y-auto bg-white px-6 py-12 sm:px-10">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
        <header className="shrink-0 text-center">
          {logoSrc ? (
            // 用 <img> 而非 next/image：尺寸固定、無需 LCP 優化，
            // 也避免 next/image 對 public 根目錄 svg/png 多一層 loader。
            // `rounded-xl border` 給 logo 一個淺灰外框，視覺上像 app icon。
            <img
              src={logoSrc}
              alt={logoAlt}
              width={logoSize}
              height={logoSize}
              className="mx-auto mb-5 object-contain rounded-xl border border-neutral-200 bg-white"
              style={{ width: logoSize, height: logoSize }}
            />
          ) : null}
          <h1 className={titleClassName}>{title}</h1>
          {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
        </header>

        <div className="w-full">{children}</div>

        {after ? <div className="shrink-0 text-center">{after}</div> : null}
      </div>
    </main>
  );
}
