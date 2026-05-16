import { headers } from "next/headers";
import { requireUnitSession } from "@/lib/auth";
import AdminShell from "@/components/AdminShell";
import SettingsClient from "./SettingsClient";

/**
 * Read-side server component for the unit settings page. Resolves the public
 * URL from the active host so admins can copy the right `https://…/o/{slug}`
 * without us hardcoding a base URL, and forwards the basic registration info
 * (name / city / contact) so it can be edited inline.
 */
export default async function SettingsPage() {
  const session = await requireUnitSession();
  const org = session.organization!;

  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const publicUrl = `${proto}://${host}/o/${org.public_slug}`;

  return (
    <AdminShell mobileMode="topbar" topbarTitle="單位設定">
      <header className="hidden md:block mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
          單位設定
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          管理單位基本資料與公開借還連結。
        </p>
      </header>

      <SettingsClient
        publicUrl={publicUrl}
        publicSlug={org.public_slug}
        publicBorrowEnabled={org.public_borrow_enabled}
        publicCatalogEnabled={org.public_catalog_enabled}
        basic={{
          name: org.name,
          city: org.city,
          contactEmail: org.contact_email,
          contactPhone: org.contact_phone,
        }}
      />
    </AdminShell>
  );
}
