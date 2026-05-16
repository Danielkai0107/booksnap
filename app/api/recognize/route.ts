import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLAN_QUOTAS,
  effectivePlan,
  getOrgPeriod,
} from "@/lib/plans";
import { isQuotaEnforced } from "@/lib/billing/flags";
import { loadOrgBillingState } from "@/lib/billing/state";

export const runtime = "nodejs";

/**
 * Free riders / generous slack for users who hit the cap right as they're
 * scanning a stack. Lets a single shelf-scan complete instead of hard-stopping
 * mid-batch.
 */
const QUOTA_GRACE = 3;

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

  if (organizationId) {
    const { org, subscription } = await loadOrgBillingState(
      organizationId,
      admin,
    );
    if (org && isQuotaEnforced(org)) {
      const plan = effectivePlan(org, subscription);
      const limit = PLAN_QUOTAS[plan].ai;
      const { start } = getOrgPeriod(org, subscription);
      const { count } = await admin
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .gte("created_at", start.toISOString());
      const used = count ?? 0;
      if (used >= limit + QUOTA_GRACE) {
        return NextResponse.json(
          {
            error: "ai_quota_exceeded",
            limit,
            used,
            plan,
            message: "本月智能辨識次數已用完，請升級方案後再試。",
          },
          { status: 402 },
        );
      }
    }
  }

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY not configured on the server. Please set it in .env.local.",
        title: "無法識別",
        category: null,
        source: "claude",
      },
      { status: 500 }
    );
  }

  const { mediaType, data } = parseImageBase64(imageBase64);

  // Build a prompt that asks Claude to both recognize the title and pick
  // the best-fitting category from the org's category list (if provided).
  // We require strict JSON so the client can parse reliably.
  const promptParts: string[] = [];
  promptParts.push(
    "你是一位圖書館員。請從這張書封圖片辨識「書名」。"
  );
  if (categories.length > 0) {
    promptParts.push(
      `另外，請從下列分類清單中挑選一個最適合此書的分類（必須完全等於清單中的某個名稱，不能自創）：\n${categories.map((c) => `- ${c}`).join("\n")}`
    );
    promptParts.push(
      '請僅回傳 JSON，格式為 {"title": "書名", "category": "分類名稱"}。若無法辨識書名，title 請填「無法識別」；若無法判斷分類，category 請填 null。不要任何多餘文字或 markdown。'
    );
  } else {
    promptParts.push(
      '請僅回傳 JSON，格式為 {"title": "書名"}。若無法辨識，title 請填「無法識別」。不要任何多餘文字或 markdown。'
    );
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
        model: "claude-sonnet-4-20250514",
        // JSON 答案非常短（書名 + 可選分類）。80 tokens 對中文書名綽綽有餘。
        max_tokens: categories.length > 0 ? 120 : 80,
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
                text: promptParts.join("\n\n"),
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

    return NextResponse.json({ title, category, source: "claude" });
  } catch (err) {
    console.error("[recognize] exception", err);
    return NextResponse.json(
      {
        error: "claude request exception",
        title: "無法識別",
        category: null,
        source: "claude",
      },
      { status: 500 }
    );
  }
}
