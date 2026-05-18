import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOrgLocked } from "@/lib/billing/lock";
import { loadOrgBillingState } from "@/lib/billing/state";
import { AI_RECOGNIZE_MONTHLY_QUOTA, getOrgPeriod } from "@/lib/plans";

export const runtime = "nodejs";

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

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        // Opus 4.7 對中文藝術字 / 毛筆字辨識力比 Sonnet 4 強，但每張貴 ~5x。
        // 童書 / 設計感封面常見 OCR 失敗，先用 Opus 觀察效果；若可接受
        // 再考慮做「Sonnet 失敗才 fallback Opus」的 adaptive retry。
        model: "claude-opus-4-7",
        // JSON 答案非常短（書名 + 可選分類）。80 tokens 對中文書名綽綽有餘。
        max_tokens: categories.length > 0 ? 120 : 80,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data,
                },
              },
              {
                type: "text",
                text: userText,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[recognize] claude error", response.status, errText);
      return NextResponse.json(
        {
          error: "claude request failed",
          status: response.status,
          title: "無法識別",
          category: null,
          source: "claude",
          // Claude 沒回成功 → 不寫 ai_usage_logs，剩餘額度不扣。
          skipped: false,
          remaining: remainingBefore,
        },
        { status: 502 }
      );
    }

    const json = (await response.json()) as {
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
    // Attempt to extract a JSON object even if Claude wrapped it.
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
          // Only accept values from the provided category list.
          if (categories.includes(c)) {
            category = c;
          }
        }
      } catch (err) {
        console.warn("[recognize] failed to parse claude json", err, raw);
      }
    } else if (raw) {
      // Backwards-compat: if Claude didn't return JSON, treat the whole
      // body as the title (legacy behaviour).
      title = raw.slice(0, 80);
    }

    void admin
      .from("ai_usage_logs")
      .insert({
        user_id: userData.user.id,
        organization_id: organizationId,
        kind: "recognize_book_cover",
        input_tokens: json.usage?.input_tokens ?? null,
        output_tokens: json.usage?.output_tokens ?? null,
      })
      .then(({ error }) => {
        if (error) console.error("[recognize] log insert error", error);
      });

    // 本次成功計入用量 → 剩餘額度 -1。clamp 到 0 避免極端值。
    const remainingAfter = quotaApplies
      ? Math.max(0, remainingBefore - 1)
      : remainingBefore;
    return NextResponse.json({
      title,
      category,
      source: "claude",
      skipped: false,
      remaining: remainingAfter,
    });
  } catch (err) {
    console.error("[recognize] exception", err);
    return NextResponse.json(
      {
        error: "claude request exception",
        title: "無法識別",
        category: null,
        source: "claude",
        skipped: false,
        remaining: remainingBefore,
      },
      { status: 500 }
    );
  }
}
