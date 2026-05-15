import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Default category seeds used when an organization has no categories yet.
const DEFAULT_CATEGORIES: Array<{ name: string; sort_order: number }> = [
  { name: "文學小說", sort_order: 10 },
  { name: "商業理財", sort_order: 20 },
  { name: "心理勵志", sort_order: 30 },
  { name: "親子教養", sort_order: 40 },
  { name: "童書繪本", sort_order: 50 },
  { name: "漫畫", sort_order: 60 },
  { name: "藝術設計", sort_order: 70 },
  { name: "人文史地", sort_order: 80 },
  { name: "自然科普", sort_order: 90 },
  { name: "電腦資訊", sort_order: 100 },
  { name: "語言學習", sort_order: 110 },
  { name: "宗教命理", sort_order: 120 },
  { name: "醫療保健", sort_order: 130 },
  { name: "飲食生活", sort_order: 140 },
  { name: "旅遊", sort_order: 150 },
  { name: "雜誌期刊", sort_order: 160 },
  { name: "其他", sort_order: 999 },
];

export async function GET() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-seed defaults if the organization has none yet.
  if ((data ?? []).length === 0) {
    const { error: seedError } = await supabase
      .from("categories")
      .insert(DEFAULT_CATEGORIES);
    if (seedError) {
      console.error("[categories] seed error", seedError);
      return NextResponse.json({ categories: [] });
    }
    const { data: seeded } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    return NextResponse.json({ categories: seeded ?? [] });
  }

  return NextResponse.json({ categories: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { name?: string; sort_order?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      name,
      sort_order:
        typeof body.sort_order === "number" ? body.sort_order : 500,
    })
    .select("*")
    .single();

  if (error) {
    const isDup =
      error.code === "23505" || /duplicate key/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "分類名稱已存在" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  return NextResponse.json({ category: data });
}
