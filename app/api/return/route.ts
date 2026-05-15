import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

type Body = {
  bookIds?: string[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const bookIds = body.bookIds;
  if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
    return NextResponse.json({ error: "bookIds required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { error: updateBooksError } = await supabase
    .from("books")
    .update({
      status: "available",
      current_holder: null,
    })
    .in("book_id", bookIds);

  if (updateBooksError) {
    return NextResponse.json(
      { error: updateBooksError.message },
      { status: 500 }
    );
  }

  // 每本書找最新一筆 returned_at is null 的 borrow_record，更新 returned_at
  const { error: updateRecordsError } = await supabase
    .from("borrow_records")
    .update({ returned_at: now })
    .in("book_id", bookIds)
    .is("returned_at", null);

  if (updateRecordsError) {
    return NextResponse.json(
      { error: updateRecordsError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, count: bookIds.length });
}
