import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

type IncomingBook = {
  title: string;
  bookId: string;
  imageBase64: string;
};

type Body = {
  adminName?: string;
  books?: IncomingBook[];
};

function dataUrlToBuffer(input: string): { buffer: Buffer; contentType: string } {
  const m = input.match(/^data:(.+?);base64,(.+)$/);
  if (m) {
    return { contentType: m[1], buffer: Buffer.from(m[2], "base64") };
  }
  return { contentType: "image/jpeg", buffer: Buffer.from(input, "base64") };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const adminName = body.adminName?.trim();
  const books = body.books;
  if (!adminName) {
    return NextResponse.json({ error: "adminName required" }, { status: 400 });
  }
  if (!books || !Array.isArray(books) || books.length === 0) {
    return NextResponse.json({ error: "books required" }, { status: 400 });
  }

  const rows: Array<{
    book_id: string;
    title: string;
    admin_name: string;
    image_url: string | null;
    status: string;
  }> = [];

  for (const b of books) {
    if (!b.bookId || !b.title) {
      return NextResponse.json(
        { error: "each book requires bookId and title" },
        { status: 400 }
      );
    }
    let imageUrl: string | null = null;
    try {
      const { buffer, contentType } = dataUrlToBuffer(b.imageBase64 ?? "");
      const path = `${b.bookId}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("book-covers")
        .upload(path, buffer, {
          contentType,
          upsert: true,
        });
      if (uploadError) {
        console.error("[books] upload error", b.bookId, uploadError);
      } else {
        const { data: pub } = supabase.storage
          .from("book-covers")
          .getPublicUrl(path);
        imageUrl = pub.publicUrl;
      }
    } catch (err) {
      console.error("[books] upload exception", b.bookId, err);
    }

    rows.push({
      book_id: b.bookId,
      title: b.title,
      admin_name: adminName,
      image_url: imageUrl,
      status: "in",
    });
  }

  const { error: insertError } = await supabase.from("books").insert(rows);
  if (insertError) {
    console.error("[books] insert error", insertError);
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, count: rows.length });
}
