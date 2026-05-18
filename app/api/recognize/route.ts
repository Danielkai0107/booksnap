import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOrgLocked } from "@/lib/billing/lock";
import { loadOrgBillingState } from "@/lib/billing/state";
import {
  AI_RECOGNIZE_MONTHLY_QUOTA,
  getOrgPeriod,
  loadAppSettings,
} from "@/lib/plans";

export const runtime = "nodejs";

/**
 * 呼叫 Anthropic /v1/messages 並嘗試解析「主書名」與分類。
 *
 * 拆成獨立函式是為了讓主流程能用「primary 失敗 → fallback 重打一次」的
 * 韌性策略，每個 model 都走同一份 prompt / 解析邏輯。
 */
async function callClaude(args: {
  model: string;
  apiKey: string;
  mediaType: string;
  data: string;
  systemPrompt: string;
  userText: string;
  categories: string[];
}): Promise<
  | {
      ok: true;
      title: string;
      category: string | null;
      usage: { input_tokens?: number; output_tokens?: number } | undefined;
    }
  | { ok: false; status?: number; errText?: string }
> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        // JSON 答案非常短（書名 + 可選分類）。80 tokens 對中文書名綽綽有餘。
        max_tokens: args.categories.length > 0 ? 120 : 80,
        system: args.systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: args.mediaType,
                  data: args.data,
                },
              },
              { type: "text", text: args.userText },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    console.error("[recognize] fetch exception", args.model, err);
    return { ok: false };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error(
      "[recognize] claude error",
      args.model,
      response.status,
      errText,
    );
    return { ok: false, status: response.status, errText };
  }

  const json = (await response.json().catch(() => ({}))) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const raw =
    json.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim() ?? "";

  let title = "無法識別";
  let category: string | null = null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as {
        title?: string;
        category?: string | null;
      };
      if (typeof parsed.title === "string" && parsed.title.trim()) {
        title = parsed.title.trim().slice(0, 80);
      }
      if (parsed.category && typeof parsed.category === "string") {
        const c = parsed.category.trim();
        if (args.categories.includes(c)) category = c;
      }
    } catch (err) {
      console.warn("[recognize] failed to parse claude json", err, raw);
    }
  } else if (raw) {
    // 沒包 JSON：legacy 行為，整段視為書名。
    title = raw.slice(0, 80);
  }
  return { ok: true, title, category, usage: json.usage };
}

type RecognizeBody = {
  imageBase64?: string;
  forceClaude?: boolean;
  categories?: string[];
};

function parseImageBase64(input: string): { mediaType: string; data: string } {
  const m = input.match(/^data:(.+?);base64,(.+)$/);
  if (m) {
    return { mediaType: m[1], data: m[2] };
  }
  return { mediaType: "image/jpeg", data: input };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Resolve organization_id eagerly so the usage log is always attributed to the
  // caller's org (the table has a default_org_id() default, but being explicit
  // keeps counts correct even if that helper ever changes).
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  const organizationId = profile?.organization_id ?? null;

  // Lock guard: external UI already prevents trial / expired-trial orgs from
  // reaching the camera, but we double-check server-side so anyone hitting
  // the endpoint directly gets a clean 403 instead of consuming Claude credit.
  //
  // 同時順手把本期使用量算出來，這樣下面的配額判斷不用再多打一次 DB。
  // `usedThisPeriod` 只在有 organizationId 時才有意義；沒組織就視為無限制
  // （理論上不會發生，因為 profile 一定要綁 org，純粹防守）。
  let usedThisPeriod = 0;
  let quotaApplies = false;
  if (organizationId) {
    const { org, subscription } = await loadOrgBillingState(
      organizationId,
      admin,
    );
    if (org && isOrgLocked(org, subscription)) {
      return NextResponse.json(
        {
          error: "locked",
          message: "升級後即可使用智能辨識。",
        },
        { status: 403 },
      );
    }
    if (org) {
      quotaApplies = true;
      // 重要：`getOrgPeriod` 在「有 active/past_due/cancelled 訂閱」時會回 subscription
      // 的 current_period_start/end；體驗中則退回 org.approved_at 月翻。所以——
      //
      //  - 體驗 → 訂閱：訂閱當下 `current_period_start = now`，下面這個 `gte`
      //    會自動排除訂閱前的紀錄，使用量歸零。
      //  - 訂閱續期：webhook 的 `renewed` 事件把 period 推到下一期，counter 歸零。
      //  - 體驗中跨月：approved_at 月翻時 start 跳到新月份，counter 歸零。
      //
      // 因此這裡用「count(`created_at >= start`)」就同時覆蓋三種週期切換場景，
      // 不需要額外的「上次重置時間」欄位或排程任務。
      const { start } = getOrgPeriod(org, subscription);
      const { count } = await admin
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", start.toISOString());
      usedThisPeriod = count ?? 0;
    }
  }

  // 計算剩餘額度。clamp 到 0 避免極端 race condition 下出現負值。
  const remainingBefore = quotaApplies
    ? Math.max(0, AI_RECOGNIZE_MONTHLY_QUOTA - usedThisPeriod)
    : AI_RECOGNIZE_MONTHLY_QUOTA;

  let body: RecognizeBody;
  try {
    body = (await req.json()) as RecognizeBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { imageBase64 } = body;
  const categories = (body.categories ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  if (!imageBase64) {
    return NextResponse.json(
      { error: "imageBase64 required" },
      { status: 400 }
    );
  }

  // 配額用盡：直接 200 回 skipped，前端就讓使用者手動輸入。
  // 不寫 ai_usage_logs（沒呼叫 Claude），不彈 toast、不擋功能（依需求設計）。
  if (quotaApplies && remainingBefore <= 0) {
    return NextResponse.json({
      title: "",
      category: null,
      source: "claude",
      skipped: true,
      remaining: 0,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY not configured on the server. Please set it in .env.local.",
        title: "無法識別",
        category: null,
        source: "claude",
        skipped: false,
        remaining: remainingBefore,
      },
      { status: 500 }
    );
  }

  const { mediaType, data } = parseImageBase64(imageBase64);

  // 把固定的角色與消歧規則放到 system，動態的分類清單與輸出格式留在 user。
  // 童書 / 繪本是最容易踩坑的情境（系列名比書名大、注音、推薦語、套書編號），
  // 所以規則寫得偏向童書；對一般書籍仍是「不要把副標 / 作者 / 出版社當書名」
  // 這種通用原則，不會傷準確率。
  const systemPrompt = [
    "你是專精於華文童書、繪本與兒少讀物的圖書館員，協助辨識書封上的「主書名」。",
    "",
    "【主書名定義】",
    "- 主書名 = 此本書獨立識別的標題，不含系列名、副標、宣傳語。",
    "- 系列名（例如「小行星巴士系列」「貓巧可」「小熊維尼」「我的第一本」）若與主書名同時出現，只回主書名。",
    "- 整本書若只有系列名而無獨立標題，才以系列名為書名。",
    "- 套書冊號（第3集、Vol.2、下集、Book 1）不納入主書名。",
    "",
    "【排除項】",
    "- 作者、繪者、譯者、出版社、Logo 文字。",
    "- 注音符號（ㄅㄆㄇㄈ⋯）不納入書名。",
    "- 得獎標記、推薦語、年齡標示（如「3 歲＋」「適合 K-2」「金鼎獎」）。",
    "- 條碼、ISBN、價格、促銷標籤。",
    "",
    "【語言偏好】",
    "- 同時出現繁中與英文時，回繁體中文書名。",
    "- 只有英文時回英文原書名。",
    "- 出現簡體字時自動轉繁體後回傳。",
    "",
    "【輸出】",
    "- 僅回 JSON，無 markdown、無多餘文字、無前言後語。",
    "- 無法辨識書名時 title 填「無法識別」。",
  ].join("\n");

  // user message 只放動態部分：分類清單（如果有）+ 輸出 schema 提醒。
  let userText: string;
  if (categories.length > 0) {
    userText =
      `另請從下列分類中挑選最適合此書的一個（必須完全等於清單中的某個名稱，不能自創；若無法判斷填 null）：\n${categories
        .map((c) => `- ${c}`)
        .join("\n")}\n\n回傳 {"title": "...", "category": "..."}。`;
  } else {
    userText = '回傳 {"title": "..."}。';
  }

  // 讀取要使用的主要 / 備用模型。兩者都可由 super-admin 線上調整（app_settings），
  // 不需 redeploy。預設值與 lib/plans.ts 內 DEFAULT_AI_PRIMARY_MODEL 對齊。
  const { aiRecognizeModelPrimary, aiRecognizeModelFallback } =
    await loadAppSettings(admin);

  const callArgs = {
    apiKey,
    mediaType,
    data,
    systemPrompt,
    userText,
    categories,
  };

  // primary 跑一次；失敗（fetch 例外 / Claude 非 2xx）才動 fallback。
  // 「無法識別」這種品質型失敗刻意不觸發 fallback——備用模型也很可能讀錯，
  // 重打只是再吃一份 token。
  let result = await callClaude({
    ...callArgs,
    model: aiRecognizeModelPrimary,
  });
  if (!result.ok && aiRecognizeModelFallback) {
    console.warn(
      "[recognize] primary failed, retrying with fallback",
      aiRecognizeModelPrimary,
      "→",
      aiRecognizeModelFallback,
      result.status,
    );
    result = await callClaude({
      ...callArgs,
      model: aiRecognizeModelFallback,
    });
  }

  if (!result.ok) {
    // 兩個模型都失敗（或沒設 fallback）→ 回 502。剩餘額度不扣。
    return NextResponse.json(
      {
        error: "claude request failed",
        status: result.status,
        title: "無法識別",
        category: null,
        source: "claude",
        skipped: false,
        remaining: remainingBefore,
      },
      { status: 502 },
    );
  }

  void admin
    .from("ai_usage_logs")
    .insert({
      user_id: userData.user.id,
      organization_id: organizationId,
      kind: "recognize_book_cover",
      input_tokens: result.usage?.input_tokens ?? null,
      output_tokens: result.usage?.output_tokens ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[recognize] log insert error", error);
    });

  // 本次成功計入用量 → 剩餘額度 -1。clamp 到 0 避免極端值。
  const remainingAfter = quotaApplies
    ? Math.max(0, remainingBefore - 1)
    : remainingBefore;
  return NextResponse.json({
    title: result.title,
    category: result.category,
    source: "claude",
    skipped: false,
    remaining: remainingAfter,
  });
}
