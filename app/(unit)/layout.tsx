import type { ReactNode } from "react";

/**
 * (unit) route group layout.
 *
 * Currently a pass-through. Previously hosted `UpgradeModalProvider`, but the
 * upgrade flow was unified to "navigate to /billing" so the cross-app modal
 * is no longer needed — every locked entry point now routes the user to the
 * billing page where the full upgrade context lives (trial status, paused
 * banner, payment history). Kept as a layout file so future (unit)-scoped
 * providers have a home without restructuring routes.
 */
export default function UnitLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
