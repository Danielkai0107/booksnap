import Link from "next/link";
import SuperAdminShell from "@/components/SuperAdminShell";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_RECOGNIZE_MONTHLY_QUOTA,
  PLAN_META,
  loadAppSettings,
} from "@/lib/plans";
import {
  DEFAULT_RANGE,
  TOKEN_PRICING,
  USAGE_RANGES,
  isUsageRange,
  loadTokenUsage,
  type OrgUsageRow,
  type UsageRange,
} from "@/lib/super-admin/token-usage";

export const dynamic = "force-dynamic";

type Search = Promise<{ range?: string }>;

function formatNtd(n: number): string {
  // 估算成本通常為小數位金額（如 NT$ 0.42），在表格內保留 2 位小數讓低用量
  // 單位也能看出非零值；總計超過 100 元時則四捨五入到整數，視覺較乾淨。
  if (n >= 100) return `NT$ ${Math.round(n).toLocaleString()}`;
  return `NT$ ${n.toFixed(2)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SuperAdminTokensPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const range: UsageRange = isUsageRange(sp.range) ? sp.range : DEFAULT_RANGE;

  const admin = createAdminClient();
  const [usage, settings] = await Promise.all([
    loadTokenUsage(admin, range),
    loadAppSettings(admin, { bypassCache: true }),
  ]);

  return (
    <SuperAdminShell contentWidth="wide">
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
            Token 用量
          </h1>
          <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
            所有單位呼叫 Claude 智能辨識（書封 OCR）的 token 累積與估算成本。
            目前主要模型：
            <code className="ml-1 px-1 py-0.5 rounded bg-neutral-100 text-neutral-800 text-xs font-mono">
              {settings.aiRecognizeModelPrimary}
            </code>
            {settings.aiRecognizeModelFallback ? (
              <>
                ，備用模型：
                <code className="ml-1 px-1 py-0.5 rounded bg-neutral-100 text-neutral-800 text-xs font-mono">
                  {settings.aiRecognizeModelFallback}
                </code>
              </>
            ) : null}
            。每月軟性配額 {AI_RECOGNIZE_MONTHLY_QUOTA} 次／單位。
          </p>
        </header>

        <RangeTabs current={range} />

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="呼叫次數"
            value={formatNumber(usage.totals.calls)}
            hint={`涉及 ${usage.totals.activeOrgs} 個單位`}
          />
          <Stat
            label="Input Tokens"
            value={formatNumber(usage.totals.inputTokens)}
          />
          <Stat
            label="Output Tokens"
            value={formatNumber(usage.totals.outputTokens)}
          />
          <Stat
            label="估算成本"
            value={formatNtd(usage.totals.estimatedCostNtd)}
            accent="emerald"
            hint={costFootnote()}
          />
        </section>

        {usage.truncated && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            紀錄量超出顯示上限（{50_000}{" "}
            筆），此區間僅顯示最近的部分資料。如需完整數據請直接查詢資料庫。
          </p>
        )}

        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-medium text-neutral-900">
                各單位用量
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                依此區間呼叫次數排序，最高在前。
              </p>
            </div>
            <span className="text-xs text-neutral-400">
              {usage.range.label}
            </span>
          </div>

          {usage.byOrg.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-neutral-500">
              此區間尚無任何辨識紀錄
            </p>
          ) : (
            <OrgUsageTable rows={usage.byOrg} />
          )}
        </section>

        <p className="text-[11px] text-neutral-400 leading-relaxed">
          成本估算：依目前 Anthropic 公開單價（Opus 4 等級）Input ${TOKEN_PRICING.inputPerMillionUsd}{" "}
          / Output ${TOKEN_PRICING.outputPerMillionUsd} 每百萬 tokens，匯率以 USD ≈ NT$
          {TOKEN_PRICING.usdToNtd} 換算。`ai_usage_logs`{" "}
          未紀錄當次實際使用的模型（主要 / 備用），所有歷史紀錄皆套同一單價，
          僅供參考；實際請以 Anthropic 帳單為準。
        </p>
      </div>
    </SuperAdminShell>
  );
}

function costFootnote(): string {
  return `Opus 4 估算 / 1M tokens`;
}

function RangeTabs({ current }: { current: UsageRange }) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto">
      {USAGE_RANGES.map((r) => {
        const active = current === r.key;
        return (
          <Link
            key={r.key}
            href={`/super-admin/tokens?range=${r.key}`}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              active
                ? "text-neutral-900 border-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 border-transparent"
            }`}
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald";
}) {
  const accentClass =
    accent === "emerald" ? "text-emerald-700" : "text-neutral-900";
  return (
    <div className="border border-neutral-200 rounded-2xl bg-white px-4 py-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] text-neutral-400 leading-tight">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function OrgUsageTable({ rows }: { rows: OrgUsageRow[] }) {
  return (
    <>
      <ul className="md:hidden divide-y divide-neutral-100">
        {rows.map((row) => (
          <OrgUsageMobileItem key={row.org.id} row={row} />
        ))}
      </ul>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500 border-b border-neutral-100">
              <th className="px-5 py-3 font-medium">單位</th>
              <th className="px-3 py-3 font-medium">計畫</th>
              <th className="px-3 py-3 font-medium text-right">呼叫</th>
              <th className="px-3 py-3 font-medium text-right">Input</th>
              <th className="px-3 py-3 font-medium text-right">Output</th>
              <th className="px-3 py-3 font-medium text-right">估算成本</th>
              <th className="px-3 py-3 font-medium text-right">最近呼叫</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <OrgUsageDesktopRow key={row.org.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OrgUsageDesktopRow({ row }: { row: OrgUsageRow }) {
  const meta = PLAN_META[row.org.plan];
  const overQuota = row.calls > AI_RECOGNIZE_MONTHLY_QUOTA;
  return (
    <tr className="border-b border-neutral-50 hover:bg-neutral-50/60 transition">
      <td className="px-5 py-3.5 align-top">
        <Link
          href="/super-admin/organizations?tab=approved"
          className="font-medium text-neutral-900 hover:underline"
        >
          {row.org.name}
        </Link>
        {row.org.contact_email ? (
          <p className="text-xs text-neutral-500 mt-0.5 truncate max-w-[16rem]">
            {row.org.contact_email}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3.5 align-top">
        <span
          className={`inline-flex items-center h-[24px] px-2 rounded-full border text-[11px] font-medium ${meta.pillClass}`}
        >
          {meta.label}
        </span>
      </td>
      <td className="px-3 py-3.5 align-top text-right tabular-nums">
        <span
          className={
            overQuota ? "text-amber-700 font-medium" : "text-neutral-900"
          }
        >
          {formatNumber(row.calls)}
        </span>
      </td>
      <td className="px-3 py-3.5 align-top text-right tabular-nums text-neutral-700">
        {formatNumber(row.inputTokens)}
      </td>
      <td className="px-3 py-3.5 align-top text-right tabular-nums text-neutral-700">
        {formatNumber(row.outputTokens)}
      </td>
      <td className="px-3 py-3.5 align-top text-right tabular-nums text-neutral-900 font-medium">
        {formatNtd(row.estimatedCostNtd)}
      </td>
      <td className="px-3 py-3.5 align-top text-right text-xs text-neutral-500">
        {formatDateTime(row.lastUsedAt)}
      </td>
    </tr>
  );
}

function OrgUsageMobileItem({ row }: { row: OrgUsageRow }) {
  const meta = PLAN_META[row.org.plan];
  const overQuota = row.calls > AI_RECOGNIZE_MONTHLY_QUOTA;
  return (
    <li className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 truncate">
            {row.org.name}
          </p>
          {row.org.contact_email ? (
            <p className="text-xs text-neutral-500 truncate">
              {row.org.contact_email}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className={`inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium ${meta.pillClass}`}
            >
              {meta.label}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p
            className={`text-lg font-semibold tabular-nums ${
              overQuota ? "text-amber-700" : "text-neutral-900"
            }`}
          >
            {formatNumber(row.calls)}
            <span className="ml-0.5 text-xs font-normal text-neutral-500">
              次
            </span>
          </p>
          <p className="text-xs text-neutral-500 tabular-nums">
            {formatNtd(row.estimatedCostNtd)}
          </p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600">
        <Pair k="Input" v={formatNumber(row.inputTokens)} />
        <Pair k="Output" v={formatNumber(row.outputTokens)} />
        <Pair k="最近呼叫" v={formatDateTime(row.lastUsedAt)} />
      </dl>
    </li>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-neutral-400">{k}</dt>
      <dd className="text-neutral-800 tabular-nums">{v}</dd>
    </>
  );
}
