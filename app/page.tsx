import { requireUnitSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import HomeClient from "./HomeClient";

export default async function HomePage() {
  const session = await requireUnitSession();

  const admin = createAdminClient();
  const { count } = await admin
    .from("ai_usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", session.organization!.id);

  return (
    <HomeClient
      orgName={session.organization?.name ?? "未命名單位"}
      aiRecognizeCount={count ?? 0}
    />
  );
}
