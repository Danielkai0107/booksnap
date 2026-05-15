import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

type Body = {
  borrowerName?: string;
  bookIds?: string[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const borrowerName = body.borrowerName?.trim();
  const bookIds = body.bookIds;
  if (!borrowerName) {
    return NextResponse.json(
      { error: "borrowerName required" },
      { status: 400 }
    );
  }
  if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
    return NextResponse.json({ error: "bookIds required" }, { status: 400 });
  }

  const memberRes = await supabase
    .from("members")
    .select("name")
    .eq("name", borrowerName)
    .maybeSingle();
  if (memberRes.error) {
    return NextResponse.json(
      { error: memberRes.error.message },
      { status: 500 }
    );
  }
  if (!memberRes.data) {
    return NextResponse.json(
      { error: "borrower is not a member" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("books")
    .update({
      status: "borrowed",
      current_holder: borrowerName,
    })
    .in("book_id", bookIds);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  const rows = bookIds.map((id) => ({
    book_id: id,
    borrower_name: borrowerName,
    borrowed_at: now,
  }));
  const { error: insertError } = await supabase
    .from("borrow_records")
    .insert(rows);

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, count: bookIds.length });
}
