import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { isQuotaEnforcedGlobally } from "@/lib/billing/flags";
import type { OrganizationRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
  const enforced = isQuotaEnforcedGlobally();
  const provider = process.env.BILLING_PROVIDER ?? "instant";

  const admin = createAdminClient();
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
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
          營運設定
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          全域開關與系統狀態。修改 env 後請重新部署。
        </p>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium text-neutral-900">配額硬擋開關</h2>
        <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
          控制 <code>/api/recognize</code> 與 <code>/api/books</code> POST
          是否在用量超出方案配額時回 402；UI 會自動引導使用者升級。
          要關閉開關但又想留特定單位的權益，請改在「單位管理」勾選免配額。
        </p>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-neutral-900">
              <code>BILLING_QUOTA_ENFORCED</code>
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              目前 env 值（生效需重新部署）
            </p>
          </div>
          <span
            className={`inline-flex items-center h-[26px] px-3 rounded-full border text-xs font-medium ${
              enforced
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : "bg-neutral-100 text-neutral-600 border-neutral-200"
            }`}
          >
            {enforced ? "已啟用" : "已關閉"}
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium text-neutral-900">金流提供者</h2>
        <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
          目前由 <code>BILLING_PROVIDER</code> 決定（<code>{provider}</code>
          ）。<code>instant</code> 代表內部測試金流，按下訂閱即升級不會實際扣款；
          上線真實金流時請改成 <code>ecpay</code> / <code>jkopay</code>
          並重新部署。
        </p>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium text-neutral-900">
          免配額單位（{bypassOrgs.length}）
        </h2>
        <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
          這些單位不受配額硬擋影響。請至「單位管理」逐筆切換。
        </p>
        {bypassOrgs.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">目前沒有免配額單位。</p>
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
  );
}
