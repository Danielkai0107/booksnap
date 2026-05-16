import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicOrg } from "@/lib/publicOrg";
import BrandedBackButton from "./BrandedBackButton";
import BrandedShareButton from "./BrandedShareButton";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

/**
 * Chrome layout for the public-facing landing / catalog pages. Keeps the
 * topbar + centred content container that gives readers the "you are inside
 * {orgName}" anchor.
 *
 * The full-screen scanner pages (`borrow`, `return`, `b/[bookId]`) live OUTSIDE
 * this route group on purpose so the camera can claim the whole viewport
 * without a topbar floating on top of it.
 */
export default async function BrandedLayout({ children, params }: Props) {
  const { slug } = await params;
  const org = await getPublicOrg(slug);
  if (!org) notFound();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-neutral-100">
        <div
          className="relative h-14 w-full max-w-2xl mx-auto flex items-center justify-center px-3"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <BrandedBackButton homeHref={`/o/${org.public_slug}`} />
          <Link
            href={`/o/${org.public_slug}`}
            className="text-base font-semibold tracking-tight text-neutral-900"
            aria-label="booksnap"
          >
            booksnap
          </Link>
          <BrandedShareButton orgName={org.name} />
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <div className="flex-1 w-full max-w-2xl mx-auto px-5 pb-10 flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}
