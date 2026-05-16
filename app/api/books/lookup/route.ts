import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export type LookupCandidate = {
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  thumbnail: string | null;
};

type GoogleVolumeIdentifier = {
  type?: string;
  identifier?: string;
};

type GoogleVolume = {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    industryIdentifiers?: GoogleVolumeIdentifier[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
};

type GoogleVolumesResponse = {
  totalItems?: number;
  items?: GoogleVolume[];
};

function pickThumbnail(img?: {
  thumbnail?: string;
  smallThumbnail?: string;
}): string | null {
  if (!img) return null;
  const url = img.thumbnail ?? img.smallThumbnail ?? null;
  if (!url) return null;
  // Google 預設給的縮圖是 http://，瀏覽器在 https 頁面會被擋；強制換成 https。
  return url.replace(/^http:\/\//, "https://");
}

function toCandidate(v: GoogleVolume): LookupCandidate | null {
  const info = v.volumeInfo;
  if (!info?.title) return null;
  const isbn13 =
    info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ??
    null;
  const isbn10 =
    info.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier ??
    null;
  const fullTitle = info.subtitle
    ? `${info.title}：${info.subtitle}`
    : info.title;
  return {
    isbn13,
    isbn10,
    title: fullTitle.slice(0, 120),
    authors: info.authors ?? [],
    publisher: info.publisher ?? null,
    publishedDate: info.publishedDate ?? null,
    thumbnail: pickThumbnail(info.imageLinks),
  };
}

type QueryResult = {
  candidates: LookupCandidate[];
  /**
   * 與 candidates 平行回傳：方便前端區分「真的沒找到」與「被 quota 擋下」。
   * - rate_limited: 429（建議申請自己的 API key）
   * - failed: 其他非 200（網路、5xx 等）
   */
  error: "rate_limited" | "failed" | null;
};

async function queryGoogleBooks(
  q: string,
  maxResults: number
): Promise<QueryResult> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("printType", "books");
  // 不強制 langRestrict，台灣繁中書有些被歸到 zh 而不是 zh-TW，限制反而找不到。
  // 若有設環境變數則帶上 API key（自己 project 的 quota，預設 1000/day 可申請調升）。
  // 沒設就走匿名 quota（全 Google 共用、容易爆）。
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (apiKey) url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), {
      // Google Books 公開資料快取一陣子沒關係，可以省 quota。
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[lookup] google books not ok", res.status, errText.slice(0, 200));
      return {
        candidates: [],
        error: res.status === 429 ? "rate_limited" : "failed",
      };
    }
    const data = (await res.json()) as GoogleVolumesResponse;
    const items = data.items ?? [];
    return {
      candidates: items
        .map(toCandidate)
        .filter((c): c is LookupCandidate => c !== null),
      error: null,
    };
  } catch (err) {
    console.warn("[lookup] google books fetch failed", err);
    return { candidates: [], error: "failed" };
  }
}

export async function GET(req: NextRequest) {
  // 需要登入才能查，避免端點被外部濫用打 quota。
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const isbn = url.searchParams.get("isbn")?.trim();
  const title = url.searchParams.get("title")?.trim();

  if (!isbn && !title) {
    return NextResponse.json({ candidates: [] });
  }

  if (isbn) {
    const cleaned = isbn.replace(/[-\s]/g, "");
    const result = await queryGoogleBooks(`isbn:${cleaned}`, 1);
    return NextResponse.json(result);
  }

  // intitle 命中率比純 q 高，配合前端送進來已正規化過的書名效果最好。
  const result = await queryGoogleBooks(`intitle:${title}`, 5);
  return NextResponse.json(result);
}
