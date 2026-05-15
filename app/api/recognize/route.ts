import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RecognizeBody = {
  imageBase64?: string;
  forceClaude?: boolean;
};

function parseImageBase64(input: string): { mediaType: string; data: string } {
  const m = input.match(/^data:(.+?);base64,(.+)$/);
  if (m) {
    return { mediaType: m[1], data: m[2] };
  }
  return { mediaType: "image/jpeg", data: input };
}

export async function POST(req: NextRequest) {
  let body: RecognizeBody;
  try {
    body = (await req.json()) as RecognizeBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { imageBase64 } = body;
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
        source: "claude",
      },
      { status: 500 }
    );
  }

  const { mediaType, data } = parseImageBase64(imageBase64);

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
        max_tokens: 100,
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
                text: "請從這張書封圖片識別書名。只回傳書名文字，不需說明。無法識別則回傳：無法識別",
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
          source: "claude",
        },
        { status: 502 }
      );
    }

    const json = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text =
      json.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("")
        .trim() ?? "";

    const title = text.length > 0 ? text.slice(0, 80) : "無法識別";
    return NextResponse.json({ title, source: "claude" });
  } catch (err) {
    console.error("[recognize] exception", err);
    return NextResponse.json(
      {
        error: "claude request exception",
        title: "無法識別",
        source: "claude",
      },
      { status: 500 }
    );
  }
}
