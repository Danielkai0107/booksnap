import Link from "next/link";
import SuperAdminShell from "@/components/SuperAdminShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAppSettings } from "@/lib/plans";
import type { OrganizationRow } from "@/lib/supabase/types";
import TrialDaysForm from "./TrialDaysForm";
import BillingEnabledForm from "./BillingEnabledForm";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
  const provider = process.env.BILLING_PROVIDER ?? "instant";

  const admin = createAdminClient();
  const { trialDays, billingEnabled } = await loadAppSettings(admin, {
    bypassCache: true,
  });

  const { data: bypassRows } = await admin
    .from("organizations")
    .select("id, name, contact_email, plan, bypass_quota")
    .eq("bypass_quota", true)
    .order("name", { ascending: true });
  const bypassOrgs = (bypassRows ?? []) as Pick<
    OrganizationRow,
    "id" | "name" | "contact_email" | "plan" | "bypass_quota"
  >[];

  return (
    <SuperAdminShell>
      <div className="space-y-10">
        <header>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
            營運設定
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            全域開關與系統狀態。體驗天數可線上調整，其餘需改 env 並重新部署。
          </p>
        </header>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-900">預設體驗天數</h2>
          <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
            新單位通過審核時，會自動設定體驗截止日為「核准日 + N 天」。
            只影響「之後新核准的單位」；既有單位請改用單位列表上的「延長體驗」。
          </p>
          <div className="mt-4">
            <TrialDaysForm initialDays={trialDays} />
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-900">方案與金流</h2>
          <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
            目前付費月費由{" "}
            <Link
              href="/super-admin/plans"
              className="text-neutral-900 underline underline-offset-2 hover:no-underline"
            >
              方案設定
            </Link>{" "}
            管理。金流商由 <code>BILLING_PROVIDER</code> env 決定（
            <code>{provider}</code>）；<code>instant</code>{" "}
            代表內部測試金流，按下訂閱即刻啟用、不會實際扣款。上線真實金流時請改成 <code>ecpay</code>{" "}
            / <code>jkopay</code> 並重新部署。
          </p>
          <div className="mt-4">
            <BillingEnabledForm initialEnabled={billingEnabled} />
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-900">
            免鎖單位（{bypassOrgs.length}）
          </h2>
          <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
            這些單位不受升級鎖影響，即使體驗結束也能無限使用全部功能。請至「單位管理」逐筆切換。
          </p>
          {bypassOrgs.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-400">目前沒有免鎖單位。</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {bypassOrgs.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-neutral-100 bg-neutral-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {o.name}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {o.contact_email}
                    </p>
                  </div>
                  <Link
                    href="/super-admin/organizations?tab=approved"
                    className="text-xs text-neutral-500 hover:text-neutral-900 transition shrink-0"
                  >
                    管理 →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SuperAdminShell>
  );
}
