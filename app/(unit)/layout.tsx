import type { ReactNode } from "react";
import { UpgradeModalProvider } from "@/components/UpgradeModal";

/**
 * (unit) route group layout.
 *
 * `UpgradeModalProvider` must live ABOVE every page in this group so the
 * page component itself — not just its children rendered through
 * `AdminShell` — can call `useUpgradeModal()`. Mounting the provider inside
 * `AdminShell` (the previous setup) silently broke entry points like the
 * "新書入庫" button in `app/(unit)/page.tsx`, because the page's own render
 * is outside `AdminShell` and got the no-op fallback context.
 */
export default function UnitLayout({ children }: { children: ReactNode }) {
  return <UpgradeModalProvider>{children}</UpgradeModalProvider>;
}
