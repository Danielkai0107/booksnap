import { requireUnitSession } from "@/lib/auth";
import CheckinEntryClient from "./CheckinEntryClient";

/**
 * The unit's "start a checkin" doorway. After the PLG split there is no
 * separate borrower-pick step (admins == authenticated unit users), so this
 * page just seeds the operator name from the session and immediately bounces
 * to `/checkin/scan`.
 */
export default async function CheckinEntryPage() {
  const session = await requireUnitSession();
  const operator =
    session.organization?.name?.trim() ||
    session.email?.split("@")[0] ||
    "管理員";
  return <CheckinEntryClient operator={operator} />;
}
