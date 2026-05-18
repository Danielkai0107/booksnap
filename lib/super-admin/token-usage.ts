/**
 * Token usage aggregation for super-admin 「Token 用量」頁。
 *
 * `ai_usage_logs` 紀錄每次 `/api/recognize` 成功呼叫 Claude 的 input/output
 * tokens（見 app/api/recognize/route.ts）。這個模組把該表彙總成：
 *
 *   - 全站累計（呼叫次數 / tokens / 估算成本）
 *   - 各單位 breakdown（讓 super-admin 一眼看出誰在燒額度）
 *
 * **成本估算的局限**：`ai_usage_logs` 沒記錄當次用的 model（主要 / 備用），
 * 所以這裡只能依「目前設定的主要模型對應的公開單價」回推估算。實際 Anthropic
 * 帳單請以後台為準；UI 上會明確標示「估算」字樣，避免誤導。
 *
 * 為了避免單一 super-admin 開頁就把整張表 dump 回來，預設只拉「最近 90 天」，
 * 全站視角足以涵蓋三個計費週期；要看更早的請另外查 DB（罕見需求，先不蓋
 * UI 入口避免效能誤觸）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgPlan, OrganizationRow } from "@/lib/supabase/types";

/** Calendar-ish 視窗。`all` 仍會被 90 天 hard cap 罩住，避免拖垮 DB。 */
export type UsageRange = "this_month" | "last_7d" | "last_30d" | "last_90d";

export const USAGE_RANGES: { key: UsageRange; label: string }[] = [
  { key: "this_month", label: "本月" },
  { key: "last_7d", label: "近 7 天" },
  { key: "last_30d", label: "近 30 天" },
  { key: "last_90d", label: "近 90 天" },
];

export const DEFAULT_RANGE: UsageRange = "this_month";

export function isUsageRange(value: unknown): value is UsageRange {
  return (
    typeof value === "string" &&
    USAGE_RANGES.some((r) => r.key === value)
  );
}

/**
 * Anthropic 公開單價（USD per 1M tokens）+ 匯率假設。
 *
 * - opus_4：input $15 / output $75
 * - sonnet_4：input $3 / output $15
 * - haiku_4：input $0.80 / output $4
 *
 * 沒有把模型 ID 嚴格 mapping，純粹做「Opus 等級 fallback」估算，因為實際
 * 模型 ID 可能會被 super-admin 改成下一代（claude-opus-4-8 之類）— 強型別
 * 反而會讓估算變成 0。要更精準的話，應該在 ai_usage_logs 加 model 欄位後
 * 再分桶計算。
 */
export const TOKEN_PRICING = {
  /** USD per million input tokens（Opus 4 公開價）。 */
  inputPerMillionUsd: 15,
  /** USD per million output tokens（Opus 4 公開價）。 */
  outputPerMillionUsd: 75,
  /** USD → NTD。手動更新即可，誤差 ±5% 對「估算」級別足夠。 */
  usdToNtd: 31.5,
} as const;

export function estimateCostNtd(
  inputTokens: number,
  outputTokens: number,
): number {
  const usd =
    (inputTokens / 1_000_000) * TOKEN_PRICING.inputPerMillionUsd +
    (outputTokens / 1_000_000) * TOKEN_PRICING.outputPerMillionUsd;
  return usd * TOKEN_PRICING.usdToNtd;
}

export type RangeWindow = {
  /** 顯示用 label（"本月" / "近 7 天"）。 */
  label: string;
  /** 範圍起點（含），UTC ISO 字串；null 代表不限。 */
  startISO: string | null;
  /** 範圍終點（不含）；通常 = now，留 null 讓查詢直接取「>= start」。 */
  endISO: string | null;
};

/**
 * 把 UsageRange 轉成實際的時間區間。本月用 UTC 月初為錨；rolling 視窗用
 * 「now − N 天」，與一般人的「過去 N 天」直覺一致。
 */
export function resolveRange(
  range: UsageRange,
  now: Date = new Date(),
): RangeWindow {
  if (range === "this_month") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    return {
      label: "本月",
      startISO: start.toISOString(),
      endISO: null,
    };
  }
  const days =
    range === "last_7d" ? 7 : range === "last_30d" ? 30 : 90;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const labelByDays: Record<number, string> = {
    7: "近 7 天",
    30: "近 30 天",
    90: "近 90 天",
  };
  return {
    label: labelByDays[days],
    startISO: start.toISOString(),
    endISO: null,
  };
}

type AiUsageLogRow = {
  organization_id: string;
  user_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

export type OrgUsageRow = {
  org: Pick<OrganizationRow, "id" | "name" | "contact_email" | "plan">;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** NT$，已含匯率轉換。 */
  estimatedCostNtd: number;
  /** 該單位最近一次呼叫時間。沒有時為 null（理論上不會出現，但防守一下）。 */
  lastUsedAt: string | null;
};

export type UsageSummary = {
  range: RangeWindow;
  totals: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostNtd: number;
    activeOrgs: number;
  };
  byOrg: OrgUsageRow[];
  /**
   * 是否有更舊的紀錄被截斷（超過 fetch 上限）。讓 UI 可以提示「資料量超出顯示
   * 上限」。實務上罕見，但避免靜默丟資料。
   */
  truncated: boolean;
};

const FETCH_HARD_LIMIT = 50_000;

/**
 * 從 ai_usage_logs 拉指定區間內的紀錄並彙總。
 *
 * 為什麼不用 SQL aggregate：表目前還很小（~百 row），fetch + JS 彙總成本可忽略；
 * 換來的好處是不需要寫 RPC / view migration，部署阻力低。日後若紀錄量逼近
 * `FETCH_HARD_LIMIT` 才需要改成 DB 端 group by。
 */
export async function loadTokenUsage(
  admin: SupabaseClient,
  range: UsageRange,
): Promise<UsageSummary> {
  const window = resolveRange(range);

  let query = admin
    .from("ai_usage_logs")
    .select("organization_id, user_id, input_tokens, output_tokens, created_at")
    .order("created_at", { ascending: false })
    .limit(FETCH_HARD_LIMIT);
  if (window.startISO) {
    query = query.gte("created_at", window.startISO);
  }
  const { data: logsRaw, error } = await query;
  if (error) {
    console.warn("[token-usage] fetch error", error);
    return emptySummary(window);
  }
  const logs = (logsRaw ?? []) as AiUsageLogRow[];
  const truncated = logs.length >= FETCH_HARD_LIMIT;

  type Bucket = {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    lastUsedAt: string | null;
  };
  const buckets = new Map<string, Bucket>();
  let totalCalls = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const log of logs) {
    totalCalls += 1;
    const input = log.input_tokens ?? 0;
    const output = log.output_tokens ?? 0;
    totalInput += input;
    totalOutput += output;

    const existing = buckets.get(log.organization_id);
    if (existing) {
      existing.calls += 1;
      existing.inputTokens += input;
      existing.outputTokens += output;
      // logs 已 desc 排序，第一次寫入即最新；後續比對保險起見仍取較大者。
      if (
        !existing.lastUsedAt ||
        log.created_at > existing.lastUsedAt
      ) {
        existing.lastUsedAt = log.created_at;
      }
    } else {
      buckets.set(log.organization_id, {
        calls: 1,
        inputTokens: input,
        outputTokens: output,
        lastUsedAt: log.created_at,
      });
    }
  }

  const orgIds = Array.from(buckets.keys());
  const orgMap = new Map<
    string,
    Pick<OrganizationRow, "id" | "name" | "contact_email" | "plan">
  >();
  if (orgIds.length > 0) {
    const { data: orgRows } = await admin
      .from("organizations")
      .select("id, name, contact_email, plan")
      .in("id", orgIds);
    for (const row of orgRows ?? []) {
      const o = row as Pick<
        OrganizationRow,
        "id" | "name" | "contact_email" | "plan"
      >;
      orgMap.set(o.id, o);
    }
  }

  const byOrg: OrgUsageRow[] = [];
  for (const [orgId, bucket] of buckets) {
    const org = orgMap.get(orgId) ?? {
      id: orgId,
      name: "（已刪除單位）",
      contact_email: "",
      plan: "trial" as OrgPlan,
    };
    byOrg.push({
      org,
      calls: bucket.calls,
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      estimatedCostNtd: estimateCostNtd(
        bucket.inputTokens,
        bucket.outputTokens,
      ),
      lastUsedAt: bucket.lastUsedAt,
    });
  }
  byOrg.sort((a, b) => b.calls - a.calls);

  return {
    range: window,
    totals: {
      calls: totalCalls,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      estimatedCostNtd: estimateCostNtd(totalInput, totalOutput),
      activeOrgs: byOrg.length,
    },
    byOrg,
    truncated,
  };
}

function emptySummary(window: RangeWindow): UsageSummary {
  return {
    range: window,
    totals: {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostNtd: 0,
      activeOrgs: 0,
    },
    byOrg: [],
    truncated: false,
  };
}
