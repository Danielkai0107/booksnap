import { redirect } from "next/navigation";
import { requireUnitSession } from "@/lib/auth";
import { maybeExpireSubscription } from "@/lib/billing/expire";
import { isOrgLocked } from "@/lib/billing/lock";
import CheckinEntryClient from "./CheckinEntryClient";

/**
 * The unit's "start a checkin" doorway. After the PLG split there is no
 * separate borrower-pick step (admins == authenticated unit users), so this
 * page just seeds the operator name from the session and immediately bounces
 * to `/checkin/scan`.
 *
 * Trial-expired / never-paid orgs are blocked here (server-side) instead of
 * each consumer (camera, manual sheet) checking quotas individually. Users
 * who follow a deep link land back on the home page with the upgrade modal
 * primed.
 */
export default async function CheckinEntryPage() {
  const session = await requireUnitSession();
  const org = session.organization;
  if (org) {
    const subscription = await maybeExpireSubscription(org.id);
    if (isOrgLocked(org, subscription)) {
      redirect("/?upgrade=new_book");
    }
  }
  const operator =
    org?.name?.trim() ||
    session.email?.split("@")[0] ||
    "管理員";
  return <CheckinEntryClient operator={operator} />;
}
