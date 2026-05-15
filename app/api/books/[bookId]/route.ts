import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

type Params = { params: Promise<{ bookId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { bookId } = await params;

  const [bookRes, recordsRes] = await Promise.all([
    supabase.from("books").select("*").eq("book_id", bookId).maybeSingle(),
    supabase
      .from("borrow_records")
      .select("*")
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
  let body: { title?: string; shelf_id?: string | null };
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
  const { error } = await supabase.from("books").delete().eq("book_id", bookId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
