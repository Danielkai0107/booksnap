import { notFound } from "next/navigation";
import { getPublicOrg } from "@/lib/publicOrg";
import BorrowClient from "./BorrowClient";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ prefill?: string }>;
};

/**
 * Public borrow shell. Resolves the org and forwards the slug + an optional
 * `?prefill={bookId}` to the client component, which is set when the reader
 * arrived via a `/o/{slug}/b/{bookId}` deep link from a QR scan.
 */
export default async function PublicBorrowPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const org = await getPublicOrg(slug);
  if (!org) notFound();
  if (!org.public_borrow_enabled) {
    return (
      <div className="pt-16 text-center text-sm text-amber-700">
        本單位的公開借書功能目前已暫停。
      </div>
    );
  }
  return (
    <BorrowClient
      slug={org.public_slug}
      orgName={org.name}
      prefillBookId={sp.prefill ?? null}
    />
  );
}
