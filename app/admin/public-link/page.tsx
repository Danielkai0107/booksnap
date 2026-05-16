import { headers } from "next/headers";
import { requireUnitSession } from "@/lib/auth";
import AdminShell from "@/components/AdminShell";
import PublicLinkClient from "./PublicLinkClient";
import ShareButton from "./ShareButton";

/**
 * Public-link management is split out from the unit basic info on purpose.
 * The QR poster, copy button, and the two visibility toggles are operational
 * controls that admins re-visit often (sharing the link, pausing public
 * borrow during off-hours), whereas the basic info is a "set once" form. The
 * route resolves the canonical URL from the active host so different
 * environments (preview / production) always hand out the right link.
 */
export default async function PublicLinkPage() {
  const session = await requireUnitSession();
  const org = session.organization!;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const publicUrl = `${proto}://${host}/o/${org.public_slug}`;

  return (
    <AdminShell
      topbarTitle="公開連結"
      topbarRight={
        <ShareButton
          url={publicUrl}
          title={`${org.name ?? "booksnap"} · 公開借還`}
          text="從這裡查詢館藏與借歸還"
        />
      }
    >
      <PublicLinkClient
        publicUrl={publicUrl}
        publicSlug={org.public_slug}
        publicBorrowEnabled={org.public_borrow_enabled}
        publicCatalogEnabled={org.public_catalog_enabled}
      />
    </AdminShell>
  );
}
