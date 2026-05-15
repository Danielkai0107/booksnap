import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrganizationRow, OrgStatus } from "@/lib/supabase/types";
import OrgRowActions from "./OrgRowActions";

type TabKey = "pending" | "approved" | "rejected" | "suspended" | "all";

type Search = Promise<{ tab?: string }>;

const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "待審核" },
  { key: "approved", label: "已通過" },
  { key: "rejected", label: "已退回" },
  { key: "suspended", label: "已停用" },
  { key: "all", label: "全部" },
];

function statusLabel(s: OrgStatus): string {
  return s === "pending"
    ? "待審核"
    : s === "approved"
    ? "已通過"
    : s === "rejected"
    ? "已退回"
    : "已停用";
}

function statusPillClass(s: OrgStatus): string {
  return s === "pending"
    ? "bg-amber-50 text-amber-700 border-amber-100"
    : s === "approved"
    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
    : s === "rejected"
    ? "bg-red-50 text-red-700 border-red-100"
    : "bg-neutral-100 text-neutral-600 border-neutral-200";
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const tab = (sp.tab as TabKey) ?? "pending";

  const admin = createAdminClient();
  let query = admin
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });
  if (tab !== "all") {
    query = query.eq("status", tab);
  }
  const { data, error } = await query;
  const orgs = (data ?? []) as OrganizationRow[];

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
        單位管理
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        審核、停用、重設單位密碼。
      </p>

      <div className="mt-6 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/super-admin/organizations?tab=${t.key}`}
              className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
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

      {error && (
        <div className="mt-6 px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
          {error.message}
        </div>
      )}

      {orgs.length === 0 ? (
        <p className="mt-12 text-center text-sm text-neutral-500">
          此分類目前沒有單位
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {orgs.map((o) => (
            <li
              key={o.id}
              className="bg-white border border-neutral-200 rounded-2xl p-5"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-neutral-900">
                      {o.name}
                    </h2>
                    <span
                      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${statusPillClass(
                        o.status
                      )}`}
                    >
                      {statusLabel(o.status)}
                    </span>
                  </div>
                  <dl className="mt-3 text-sm text-neutral-600 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    <Pair k="縣市" v={o.city} />
                    <Pair k="Email" v={o.contact_email} />
                    <Pair k="聯絡電話" v={o.contact_phone} />
                    <Pair
                      k="送出時間"
                      v={new Date(o.created_at).toLocaleString("zh-TW")}
                    />
                    {o.approved_at && (
                      <Pair
                        k="核准時間"
                        v={new Date(o.approved_at).toLocaleString("zh-TW")}
                      />
                    )}
                    {o.rejected_reason && (
                      <Pair k="退回原因" v={o.rejected_reason} />
                    )}
                  </dl>
                </div>
                <OrgRowActions
                  orgId={o.id}
                  orgName={o.name}
                  status={o.status}
                />
              </div>
            </li>
          ))}
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
