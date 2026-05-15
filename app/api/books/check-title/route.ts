import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const title = url.searchParams.get("title")?.trim();
  if (!title) {
    return NextResponse.json({ matches: [] });
  }

  // 拿掉「(N)」後綴後比對，這樣 ABC、ABC (2)、ABC (3) 會視為同一個系列
  const baseTitle = title.replace(/\s*\(\d+\)\s*$/, "").trim();
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
