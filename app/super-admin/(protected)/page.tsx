import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SuperAdminDashboard() {
  const admin = createAdminClient();
  const [{ data: orgs }, { count: usersCount }] = await Promise.all([
    admin
      .from("organizations")
      .select("status")
      .order("created_at", { ascending: false }),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "unit"),
  ]);

  const counts = {
    total: orgs?.length ?? 0,
    pending: orgs?.filter((o) => o.status === "pending").length ?? 0,
    approved: orgs?.filter((o) => o.status === "approved").length ?? 0,
    rejected: orgs?.filter((o) => o.status === "rejected").length ?? 0,
    suspended: orgs?.filter((o) => o.status === "suspended").length ?? 0,
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
        總覽
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        所有單位的整體狀態。
      </p>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="所有單位" value={counts.total} />
        <Stat label="待審核" value={counts.pending} accent="amber" />
        <Stat label="已通過" value={counts.approved} accent="emerald" />
        <Stat label="已退回" value={counts.rejected} />
        <Stat label="已停用" value={counts.suspended} />
      </div>

      <div className="mt-10 flex items-center justify-between p-5 border border-neutral-200 rounded-2xl bg-white">
        <div>
          <p className="text-sm font-medium text-neutral-900">單位審核</p>
          <p className="text-xs text-neutral-500 mt-1">
            目前有 <span className="font-medium text-amber-700">{counts.pending}</span> 個申請等待你審核
          </p>
        </div>
        <Link
          href="/super-admin/organizations?tab=pending"
          className="bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
        >
          前往審核
        </Link>
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        登入單位數：{usersCount ?? 0}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "emerald";
}) {
  const accentClass =
    accent === "amber"
      ? "text-amber-700"
      : accent === "emerald"
      ? "text-emerald-700"
      : "text-neutral-900";
  return (
    <div className="border border-neutral-200 rounded-2xl bg-white px-4 py-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {value}
      </p>
    </div>
  );
}
