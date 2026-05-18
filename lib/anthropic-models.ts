/**
 * 從 Anthropic 拉「目前可用的 vision 模型」清單，給 super-admin 設定頁的
 * 下拉選單用。新模型上線會自動出現、deprecated 會自然消失，省掉手動維護
 * 硬編碼清單的維運負擔。
 *
 * - 只回傳 capabilities.image_input.supported === true 的模型
 *   （/api/recognize 一定要送圖，沒這能力就不該被選）
 * - 10 分鐘 in-process cache，super-admin 設定頁打開多少次都只查一次
 * - 失敗 fallback 到 hardcoded LAST_KNOWN_VISION_MODELS，避免 Anthropic
 *   暫時出包時整個設定頁無法 render
 */

export type AnthropicVisionModel = {
  id: string;
  /** 例如 "Claude Opus 4.7"。沒拿到時退回 id。 */
  displayName: string;
  /** ISO 字串。同代模型按此排序，最新在前。 */
  createdAt: string;
};

/**
 * Anthropic API 真的掛掉時的 fallback。手動維護成本低（半年更新一次也 ok），
 * 因為這只是 super-admin 設定頁 UI 用，不影響執行期 /api/recognize 行為。
 * 模型實際是否仍可用會在 API 呼叫時自然顯現（4xx）。
 */
const LAST_KNOWN_VISION_MODELS: AnthropicVisionModel[] = [
  {
    id: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    createdAt: "2026-04-16T00:00:00Z",
  },
  {
    id: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4",
    createdAt: "2025-05-14T00:00:00Z",
  },
];

type CacheEntry = { value: AnthropicVisionModel[]; loadedAt: number };
let modelsCache: CacheEntry | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

type AnthropicModelInfoRaw = {
  id: string;
  display_name?: string;
  created_at?: string;
  capabilities?: {
    image_input?: { supported?: boolean };
  };
};

/**
 * 拉一份 Anthropic 目前可用、支援 image input 的模型清單。
 * 失敗時退回 cache（若有）或 hardcoded fallback；永遠不丟例外，讓設定頁
 * 在 Anthropic 不可達時仍可開啟。
 */
export async function fetchVisionModels(): Promise<AnthropicVisionModel[]> {
  if (modelsCache && Date.now() - modelsCache.loadedAt < CACHE_TTL_MS) {
    return modelsCache.value;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return modelsCache?.value ?? LAST_KNOWN_VISION_MODELS;
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      // Next.js fetch 預設快取會持續到 deploy；改 no-store 確保 10 分鐘
      // in-process cache 才是真實的 TTL 來源。
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[anthropic-models] fetch failed", res.status);
      return modelsCache?.value ?? LAST_KNOWN_VISION_MODELS;
    }
    const data = (await res.json()) as { data?: AnthropicModelInfoRaw[] };
    const models: AnthropicVisionModel[] = (data.data ?? [])
      .filter(
        (m) =>
          typeof m.id === "string" &&
          m.id.toLowerCase().startsWith("claude-") &&
          m.capabilities?.image_input?.supported === true,
      )
      .map((m) => ({
        id: m.id,
        displayName: (m.display_name ?? m.id).trim(),
        createdAt: m.created_at ?? "",
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Anthropic 沒回任何 vision model（理論上不會發生）→ 視為 API 異常退回。
    if (models.length === 0) {
      return modelsCache?.value ?? LAST_KNOWN_VISION_MODELS;
    }
    modelsCache = { value: models, loadedAt: Date.now() };
    return models;
  } catch (err) {
    console.warn("[anthropic-models] fetch exception", err);
    return modelsCache?.value ?? LAST_KNOWN_VISION_MODELS;
  }
}

/**
 * 給 UI 顯示用的友善日期（YYYY-MM-DD）。createdAt 為空時回 null。
 */
export function formatModelDate(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
