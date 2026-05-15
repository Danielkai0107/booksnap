import { requireUnitSession } from "@/lib/auth";
import HomeClient from "./HomeClient";

export default async function HomePage() {
  const session = await requireUnitSession();
  return <HomeClient orgName={session.organization?.name ?? "未命名單位"} />;
}
