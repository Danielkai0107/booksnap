import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getPublicOrg } from "@/lib/publicOrg";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ slug: string; bookId: string }>;
};

/**
 * Deep-link router for label QRs. The QR encodes `/o/{slug}/b/{bookId}`; we
 * resolve the book status here and send the user straight to either the
 * borrow or return flow, with the `bookId` carried over via `?prefill=`.
 *
 * If the book belongs to a different tenant (or doesn't exist), we render a
 * friendly error rather than 404 — the URL is reachable from someone else's
 * printed label, and we don't want to look broken.
 */
export default async function DeepLinkBookPage({ params }: Props) {
  const { slug, bookId } = await params;
  const org = await getPublicOrg(slug);
  if (!org) notFound();

  const admin = createAdminClient();
  const { data: book } = await admin
    .from("books")
    .select("book_id, title, status, organization_id")
    .eq("organization_id", org.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (!book) {
    return (
      <ErrorState
        slug={org.public_slug}
        title="找不到這本書"
        message={`書本編號 ${bookId} 不在 ${org.name} 的館藏中。請確認 QR 是否來自正確的單位。`}
      />
    );
  }

  if (!org.public_borrow_enabled) {
    return (
      <ErrorState
        slug={org.public_slug}
        title="服務暫停"
        message={`${org.name} 目前暫停公開借還，請改聯絡單位人員。`}
      />
    );
  }

  const target =
    book.status === "available"
      ? `/o/${encodeURIComponent(org.public_slug)}/borrow?prefill=${encodeURIComponent(book.book_id as string)}`
      : `/o/${encodeURIComponent(org.public_slug)}/return?prefill=${encodeURIComponent(book.book_id as string)}`;
  redirect(target);
}

function ErrorState({
  slug,
  title,
  message,
}: {
  slug: string;
  title: string;
  message: string;
}) {
  return (
    <div className="pt-16 max-w-sm mx-auto text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-5">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-amber-600"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
        {title}
      </h2>
      <p className="mt-2 text-sm text-neutral-500 leading-relaxed">{message}</p>
      <Link
        href={`/o/${encodeURIComponent(slug)}`}
        className="mt-6 inline-block px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium rounded-xl"
      >
        回到單位首頁
      </Link>
    </div>
  );
}
