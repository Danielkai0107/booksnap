import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_META, loadPlanConfigs } from "@/lib/plans";
import type {
  OrganizationRow,
  PaymentRow,
  SubscriptionRow,
  SubscriptionStatus,
} from "@/lib/supabase/types";

type StatusFilter = SubscriptionStatus | "all";

// 用 `?tab=` 而非 `?status=`，避免跟 AuthStatusToast 監聽的 `?status=` 撞名
// （撞名會導致一點 tab 就被 router.replace 踢回 homePath）。
type Search = Promise<{ tab?: string }>;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "進行中" },
  { key: "past_due", label: "扣款失敗" },
  { key: "cancelled", label: "已取消（期內）" },
  { key: "expired", label: "已過期" },
  { key: "pending", label: "處理中" },
];

function statusPillClass(s: SubscriptionStatus): string {
  if (s === "active") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }
  if (s === "past_due") {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }
  if (s === "cancelled") {
    return "bg-orange-50 text-orange-700 border-orange-100";
  }
  if (s === "expired") {
    return "bg-neutral-100 text-neutral-500 border-neutral-200";
  }
  return "bg-blue-50 text-blue-700 border-blue-100";
}

function statusLabel(s: SubscriptionStatus): string {
  return {
    pending: "處理中",
    active: "進行中",
    past_due: "扣款失敗",
    cancelled: "已取消（期內）",
    expired: "已過期",
  }[s];
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const tab = (sp.tab as StatusFilter) ?? "all";

  const admin = createAdminClient();
  let query = admin
    .from("subscriptions")
    .select("*")
    .order("updated_at", { ascending: false });
  if (tab !== "all") {
    query = query.eq("status", tab);
  }
  const { data: subsData } = await query;
  const subs = (subsData ?? []) as SubscriptionRow[];

  const orgIds = Array.from(new Set(subs.map((s) => s.organization_id)));
  const subIds = subs.map((s) => s.id);

  const [{ data: orgRows }, { data: paymentRows }] = await Promise.all([
    orgIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .from("organizations")
          .select("id, name, contact_email, plan, bypass_quota")
          .in("id", orgIds),
    subIds.length === 0
      ? Promise.resolve({ data: [] })
      : admin
          .from("payments")
          .select("*")
          .in("subscription_id", subIds)
          .order("created_at", { ascending: false }),
  ]);
  const orgsById = new Map<
    string,
    Pick<
      OrganizationRow,
      "id" | "name" | "contact_email" | "plan" | "bypass_quota"
    >
  >();
  (orgRows ?? []).forEach((o) => {
    orgsById.set(
      o.id,
      o as Pick<
        OrganizationRow,
        "id" | "name" | "contact_email" | "plan" | "bypass_quota"
      >,
    );
  });

  const lastPaymentBySub = new Map<string, PaymentRow>();
  (paymentRows ?? []).forEach((row) => {
    const p = row as PaymentRow;
    if (p.subscription_id && !lastPaymentBySub.has(p.subscription_id)) {
      lastPaymentBySub.set(p.subscription_id, p);
    }
  });

  const { prices } = await loadPlanConfigs(admin);

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
        訂閱列表
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        所有單位的訂閱狀態與最近一筆扣款。
      </p>

      <div className="mt-6 flex gap-1 border-b border-neutral-200 overflow-x-auto">
        {STATUS_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/super-admin/subscriptions?tab=${t.key}`}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
                active
                  ? "text-neutral-900 border-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900 border-transparent"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {subs.length === 0 ? (
        <p className="mt-12 text-center text-sm text-neutral-500">
          此分類目前沒有訂閱
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {subs.map((sub) => {
            const org = orgsById.get(sub.organization_id);
            const lastPayment = lastPaymentBySub.get(sub.id);
            const meta = PLAN_META[sub.plan];
            const price = prices[sub.plan];
            return (
              <li
                key={sub.id}
                className="bg-white border border-neutral-200 rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/super-admin/organizations?tab=all`}
                        className="text-base font-semibold text-neutral-900 hover:underline"
                      >
                        {org?.name ?? "（已刪除單位）"}
                      </Link>
                      <span
                        className={`inline-flex items-center h-[22px] text-[11px] px-2 rounded-full border font-medium ${meta.pillClass}`}
                      >
                        {meta.label}
                      </span>
                      <span
                        className={`inline-flex items-center h-[22px] text-[11px] px-2 rounded-full border font-medium ${statusPillClass(sub.status)}`}
                      >
                        {statusLabel(sub.status)}
                      </span>
                      {sub.cancel_at_period_end && sub.status === "active" && (
                        <span className="inline-flex items-center h-[22px] text-[11px] px-2 rounded-full border font-medium bg-amber-50 text-amber-700 border-amber-100">
                          到期取消
                        </span>
                      )}
                      {org?.bypass_quota && (
                        <span className="inline-flex items-center h-[22px] text-[11px] px-2 rounded-full border font-medium bg-indigo-50 text-indigo-700 border-indigo-100">
                          免鎖
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 text-sm text-neutral-600 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                      <Pair k="月費" v={price.label} />
                      <Pair k="金流商" v={sub.gateway} />
                      <Pair k="首次訂閱" v={fmt(sub.started_at)} />
                      <Pair
                        k="本期"
                        v={`${fmt(sub.current_period_start)} ~ ${fmt(sub.current_period_end)}`}
                      />
                      {sub.cancelled_at && (
                        <Pair k="取消時間" v={fmt(sub.cancelled_at)} />
                      )}
                      {lastPayment && (
                        <Pair
                          k="最近扣款"
                          v={`${fmt(lastPayment.created_at)} · NT$ ${lastPayment.amount.toLocaleString()} · ${lastPayment.status}`}
                        />
                      )}
                      {org?.contact_email && (
                        <Pair k="聯絡 Email" v={org.contact_email} />
                      )}
                    </dl>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-xs text-neutral-400">{k}</dt>
      <dd className="text-neutral-800 break-all">{v}</dd>
    </>
  );
}
