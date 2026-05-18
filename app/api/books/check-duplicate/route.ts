import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  coreTitle,
  isSameBookTitle,
  isbnVariants,
  stripCopySuffix,
} from "@/lib/titleMatch";

export const runtime = "nodejs";

type DuplicateRow = {
  book_id: string;
  title: string;
  image_url: string | null;
  checkin_time: string | null;
  status: string | null;
  current_holder: string | null;
};

/**
 * 重複偵測：
 *  - 若帶 ?isbn=xxx，以 ISBN 比對；同時查 10 / 13 碼變體，避免館藏存 10 碼、
 *    輸入是 13 碼（或反之）時誤判為新書。
 *  - 否則退回 ?title= 模糊比對：先用 core title 的前綴 ilike 把候選縮到一小堆，
 *    再在 Node 端用 isSameBookTitle 過濾（normalize / coreTitle / 包含），
 *    避免漏判「同名但帶副標」「大小寫不同」「前後空白」等情況。
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

  const baseTitle = stripCopySuffix(titleRaw ?? "");

  if (isbnRaw) {
    const variants = isbnVariants(isbnRaw);
    if (variants.length === 0) {
      return NextResponse.json({ base: baseTitle, matches: [] });
    }
    const { data, error } = await supabase
      .from("books")
      .select(
        "book_id, title, image_url, checkin_time, status, current_holder",
      )
      .in("isbn", variants)
      .order("checkin_time", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      base: baseTitle || variants[0],
      matches: data ?? [],
    });
  }

  // Title-only flow.
  if (!baseTitle) {
    return NextResponse.json({ base: "", matches: [] });
  }

  // SQL 預過濾：取 core title 的前綴做 ilike，把資料量壓在 ~50 筆內，
  // 再交給 Node 端的 isSameBookTitle 做精確判斷。前綴太短會撈太多，太長
  // 又會錯過「Java Script」這種插入空白的變形 — 取 4~8 字當折衷。
  const core = coreTitle(baseTitle);
  if (!core) {
    return NextResponse.json({ base: baseTitle, matches: [] });
  }
  const prefixLen = Math.min(core.length, Math.max(4, Math.min(8, core.length)));
  const prefix = core.slice(0, prefixLen);
  const escaped = prefix.replace(/[%_\\]/g, (m) => `\\${m}`);

  const { data, error } = await supabase
    .from("books")
    .select("book_id, title, image_url, checkin_time, status, current_holder")
    .ilike("title", `%${escaped}%`)
    .order("checkin_time", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const matches = (data ?? []).filter((row: DuplicateRow) =>
    isSameBookTitle(baseTitle, row.title),
  );

  return NextResponse.json({
    base: baseTitle,
    matches,
  });
}
