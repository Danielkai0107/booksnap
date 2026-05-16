import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 重複偵測：
 *  - 若帶 ?isbn=xxx，以 ISBN 比對（最準，同一本書多本拷貝 ISBN 相同）。
 *  - 否則退回 ?title= 的 ilike 模糊比對（沿用舊行為）。
 *
 * 回傳格式：{ base, matches }
 *   - base：去除「(N)」副本後綴的書名，前端用來組「base (N+1)」序號。
 *   - matches：依入庫時間升序，前端按長度算下一個 (N)。
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const isbnRaw = url.searchParams.get("isbn")?.trim();
  const titleRaw = url.searchParams.get("title")?.trim();

  if (!isbnRaw && !titleRaw) {
    return NextResponse.json({ base: "", matches: [] });
  }

  const baseTitle = (titleRaw ?? "").replace(/\s*\(\d+\)\s*$/, "").trim();

  if (isbnRaw) {
    const cleaned = isbnRaw.replace(/[-\s]/g, "");
    const { data, error } = await supabase
      .from("books")
      .select(
        "book_id, title, image_url, checkin_time, status, current_holder"
      )
      .eq("isbn", cleaned)
      .order("checkin_time", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      base: baseTitle || cleaned,
      matches: data ?? [],
    });
  }

  const escaped = baseTitle.replace(/[%_]/g, (m) => `\\${m}`);
  const { data, error } = await supabase
    .from("books")
    .select("book_id, title, image_url, checkin_time, status, current_holder")
    .or(`title.eq.${baseTitle},title.ilike.${escaped} (%)`)
    .order("checkin_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    base: baseTitle,
    matches: data ?? [],
  });
}
