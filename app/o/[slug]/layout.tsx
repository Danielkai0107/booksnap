import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getPublicOrg } from "@/lib/publicOrg";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

/**
 * Public org guard. Resolves the slug once at the top of the `/o/{slug}` tree
 * so deeper pages can trust the org exists, then renders children with no
 * visual chrome — the chrome lives in the `(branded)` route group so that
 * full-screen scanner pages (borrow / return / b/[bookId]) can opt out by
 * staying outside that group.
 */
export default async function PublicOrgLayout({ children, params }: Props) {
  const { slug } = await params;
  const org = await getPublicOrg(slug);
  if (!org) notFound();
  return <>{children}</>;
}
