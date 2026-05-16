import { notFound } from "next/navigation";
import { getPublicOrg } from "@/lib/publicOrg";
import ReturnClient from "./ReturnClient";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ prefill?: string }>;
};

export default async function PublicReturnPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const org = await getPublicOrg(slug);
  if (!org) notFound();
  if (!org.public_borrow_enabled) {
    return (
      <div className="pt-16 text-center text-sm text-amber-700">
        本單位的公開借還功能目前已暫停。
      </div>
    );
  }
  return (
    <ReturnClient
      slug={org.public_slug}
      orgName={org.name}
      prefillBookId={sp.prefill ?? null}
    />
  );
}
