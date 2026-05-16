import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ bookId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { bookId } = await params;
  const supabase = await createClient();

  // Pull records joined with the borrower row so the admin UI can render the
  // current display name without an extra round-trip per record. Borrower
  // identity is keyed by `borrower_id` (phone-scoped per organization).
  const [bookRes, recordsRes] = await Promise.all([
    supabase.from("books").select("*").eq("book_id", bookId).maybeSingle(),
    supabase
      .from("borrow_records")
      .select(
        "id, book_id, borrower_id, borrowed_at, returned_at, location_note, organization_id, borrower:borrowers(id, display_name, phone)"
      )
      .eq("book_id", bookId)
      .order("borrowed_at", { ascending: false }),
  ]);

  if (bookRes.error) {
    return NextResponse.json({ error: bookRes.error.message }, { status: 500 });
  }
  if (!bookRes.data) {
    return NextResponse.json({ error: "book not found" }, { status: 404 });
  }

  return NextResponse.json({
    book: bookRes.data,
    records: recordsRes.data ?? [],
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { bookId } = await params;
  const supabase = await createClient();
  let body: {
    title?: string;
    shelf_id?: string | null;
    category_id?: string | null;
    isbn?: string | null;
    authors?: string | null;
    publisher?: string | null;
    published_date?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (body.shelf_id === null || typeof body.shelf_id === "string") {
    patch.shelf_id = body.shelf_id || null;
  }
  if (body.category_id === null || typeof body.category_id === "string") {
    patch.category_id = body.category_id || null;
  }
  if (body.isbn === null || typeof body.isbn === "string") {
    patch.isbn = body.isbn ? body.isbn.replace(/[-\s]/g, "") : null;
  }
  if (body.authors === null || typeof body.authors === "string") {
    patch.authors = body.authors?.trim() || null;
  }
  if (body.publisher === null || typeof body.publisher === "string") {
    patch.publisher = body.publisher?.trim() || null;
  }
  if (body.published_date === null || typeof body.published_date === "string") {
    const d = body.published_date;
    patch.published_date =
      d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("books")
    .update(patch)
    .eq("book_id", bookId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "book not found" }, { status: 404 });
  }
  return NextResponse.json({ book: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { bookId } = await params;
  const supabase = await createClient();

  // 1. 先取出 image_url 用來反推 storage path（刪 row 後就拿不到了）
  const { data: existing } = await supabase
    .from("books")
    .select("image_url")
    .eq("book_id", bookId)
    .maybeSingle();

  const { error } = await supabase.from("books").delete().eq("book_id", bookId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. 同步刪 storage 檔，避免孤兒檔長期累積
  //    只清自家 bucket 的圖；Google Books 的遠端 URL 跳過。
  const url = existing?.image_url;
  if (url) {
    const path = extractCoverPath(url);
    if (path) {
      const { error: rmError } = await supabase.storage
        .from("book-covers")
        .remove([path]);
      if (rmError) {
        // 刪不到不影響主要刪除流程，僅記錄。
        console.warn("[books] storage remove failed", path, rmError);
      }
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * 從 Supabase Storage 的 public URL 反推 bucket 內路徑。
 * URL 形如：
 *   https://xxx.supabase.co/storage/v1/object/public/book-covers/<orgId>/<bookId>-<stamp>.jpg
 */
function extractCoverPath(url: string): string | null {
  const marker = "/book-covers/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length).split("?")[0];
  return path || null;
}
