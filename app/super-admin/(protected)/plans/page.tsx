import { createAdminClient } from "@/lib/supabase/admin";
import { loadPlanConfigs } from "@/lib/plans";
import PlansEditorClient from "./PlansEditorClient";

export const dynamic = "force-dynamic";

export default async function SuperAdminPlansPage() {
  const admin = createAdminClient();
  // Bypass the in-process cache so the editor always shows the current row,
  // even when a teammate just changed it on a different instance.
  const { prices } = await loadPlanConfigs(admin, { bypassCache: true });

  const { data: row } = await admin
    .from("plan_configs")
    .select("plan, monthly_price, updated_at")
    .eq("plan", "pro")
    .maybeSingle();

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
          方案設定
        </h1>
        <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
          目前只有一個付費方案（Pro）。調整月費後立即套用，所有單位下次請求都會看到新的數字。
        </p>
      </header>

      <PlansEditorClient
        initial={{
          monthlyPrice: row?.monthly_price ?? prices.pro.monthly,
          updatedAt: row?.updated_at ?? null,
        }}
      />
    </div>
  );
}
