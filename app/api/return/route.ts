import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

type Body = {
  bookId?: string;
  shelfId?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { bookId, shelfId } = body;
  if (!bookId || !shelfId) {
    return NextResponse.json(
      { error: "bookId and shelfId required" },
      { status: 400 }
    );
  }

  const returnTime = new Date().toISOString();
  const { data, error } = await supabase
    .from("books")
    .update({
      status: "out",
      shelf_id: shelfId,
      return_time: returnTime,
    })
    .eq("book_id", bookId)
    .select("title, return_time")
    .maybeSingle();

  if (error) {
    console.error("[return] update error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: `book not found: ${bookId}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    book: {
      title: data.title,
      return_time: data.return_time,
    },
  });
}
