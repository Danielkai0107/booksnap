import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLAN_META,
  PLAN_ORDER,
  loadPlanConfigs,
  type OrgPlan,
} from "@/lib/plans";
import PlansEditorClient from "./PlansEditorClient";

export const dynamic = "force-dynamic";

type PlanConfigRow = {
  plan: OrgPlan;
  ai_quota: number;
  book_quota: number;
  monthly_price: number;
  updated_at: string;
};

export default async function SuperAdminPlansPage() {
  const admin = createAdminClient();
  // Use the same loader as the rest of the app — that way an SA editing the
  // page sees exactly what end users see, including any fallback if the row
  // is missing.
  await loadPlanConfigs(admin, { bypassCache: true });

  const { data: rows } = await admin
    .from("plan_configs")
    .select("plan, ai_quota, book_quota, monthly_price, updated_at");
  const byPlan = new Map<OrgPlan, PlanConfigRow>();
  for (const r of (rows ?? []) as PlanConfigRow[]) {
    byPlan.set(r.plan, r);
  }

  const initial = PLAN_ORDER.map((p) => {
    const row = byPlan.get(p);
    return {
      plan: p,
      label: PLAN_META[p].label,
      pillClass: PLAN_META[p].pillClass,
      aiQuota: row?.ai_quota ?? 0,
      bookQuota: row?.book_quota ?? 0,
      monthlyPrice: row?.monthly_price ?? 0,
      updatedAt: row?.updated_at ?? null,
    };
  });

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
          方案設定
        </h1>
        <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
          調整每個方案的 AI 配額、館藏冊數上限與月費。儲存後立即套用，所有單位下次請求都會看到新的數值。
          排序限制：Free ≤ Plus ≤ Pro。Free 方案價格固定為 0。
        </p>
      </header>

      <PlansEditorClient initial={initial} />
    </div>
  );
}
