import { notFound } from "next/navigation";
import { getPublicOrg } from "@/lib/publicOrg";
import CatalogClient from "./CatalogClient";

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * Public catalog. Opt-out per organization via `public_catalog_enabled`.
 * The catalog deliberately does NOT show borrower email or full phone — only
 * the masked phone tail and display name — so that anonymous readers can
 * recognise "their" borrow without breaching privacy.
 */
export default async function PublicCatalogPage({ params }: Props) {
  const { slug } = await params;
  const org = await getPublicOrg(slug);
  if (!org) notFound();
  if (!org.public_catalog_enabled) {
    return (
      <div className="pt-16 text-center text-sm text-amber-700">
        本單位未開放讀者查書功能。
      </div>
    );
  }
  return <CatalogClient slug={org.public_slug} orgName={org.name} />;
}
