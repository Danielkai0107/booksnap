import { requireUnitSession } from "@/lib/auth";
import AdminShell from "@/components/AdminShell";
import SettingsClient from "./SettingsClient";

/**
 * Unit basic info — the four fields the unit filled in at registration
 * (name / city / contact email / contact phone). Public-link sharing and the
 * visibility toggles live on their own page `/admin/public-link` so this
 * screen stays focused on "who runs this unit" data.
 */
export default async function SettingsPage() {
  const session = await requireUnitSession();
  const org = session.organization!;

  return (
    <AdminShell topbarTitle="單位資料">
      <SettingsClient
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
