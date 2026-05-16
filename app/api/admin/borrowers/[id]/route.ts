import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

type BorrowRecordRow = {
  id: string;
  book_id: string;
  borrowed_at: string;
  returned_at: string | null;
  location_note: string | null;
};

type BookRow = {
  book_id: string;
  title: string;
  image_url: string | null;
  status: string | null;
  shelf_id: string | null;
  current_holder_id: string | null;
  current_holder: string | null;
  current_location: string | null;
  admin_name: string | null;
  checkin_time: string | null;
  category_id: string | null;
  category: { name: string } | null;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const [borrowerRes, holdingRes, recordsRes] = await Promise.all([
    supabase
      .from("borrowers")
      .select("id, phone, display_name, email, last_active_at, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("books")
      .select("book_id, title, image_url, current_location")
      .eq("current_holder_id", id),
    supabase
      .from("borrow_records")
      .select("id, book_id, borrowed_at, returned_at, location_note")
      .eq("borrower_id", id)
      .order("borrowed_at", { ascending: false }),
  ]);

  if (borrowerRes.error) {
    return NextResponse.json(
      { error: borrowerRes.error.message },
      { status: 500 }
    );
  }
  if (!borrowerRes.data) {
    return NextResponse.json({ error: "borrower not found" }, { status: 404 });
  }

  const records = (recordsRes.data ?? []) as BorrowRecordRow[];
  const bookIds = Array.from(new Set(records.map((r) => r.book_id)));

  let books: Record<string, BookRow & { category_name: string | null }> = {};
  if (bookIds.length > 0) {
    const { data: bookRows } = await supabase
      .from("books")
      .select(
        "book_id, title, image_url, status, shelf_id, current_holder_id, current_holder, current_location, admin_name, checkin_time, category_id, category:categories(name)"
      )
      .in("book_id", bookIds);
    books = ((bookRows ?? []) as unknown as BookRow[]).reduce(
      (acc, b) => {
        acc[b.book_id] = {
          ...b,
          category_name: b.category?.name ?? null,
        };
        return acc;
      },
      {} as Record<string, BookRow & { category_name: string | null }>
    );
  }

  return NextResponse.json({
    borrower: borrowerRes.data,
    holding: holdingRes.data ?? [],
    records,
    books,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  let body: { display_name?: string; email?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.display_name === "string") {
    const trimmed = body.display_name.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "display_name cannot be empty" },
        { status: 400 }
      );
    }
    patch.display_name = trimmed;
  }
  if (body.email === null || typeof body.email === "string") {
    patch.email = body.email ? body.email.trim().toLowerCase() : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("borrowers")
    .update(patch)
    .eq("id", id)
    .select("id, phone, display_name, email, last_active_at, created_at")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "borrower not found" }, { status: 404 });
  }

  // Keep books.current_holder denormalized cache aligned with the new name.
  if (typeof patch.display_name === "string") {
    await supabase
      .from("books")
      .update({ current_holder: patch.display_name })
      .eq("current_holder_id", id);
  }

  return NextResponse.json({ borrower: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const { count } = await supabase
    .from("books")
    .select("*", { count: "exact", head: true })
    .eq("current_holder_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "此借閱人目前還有未歸還的書，無法刪除" },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("borrowers").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
