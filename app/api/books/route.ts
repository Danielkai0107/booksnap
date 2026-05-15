import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type IncomingBook = {
  title: string;
  bookId: string;
  imageBase64: string;
  categoryId?: string | null;
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
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Resolve the caller's organization for storage path scoping.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  const orgId = profile?.organization_id;
  if (!orgId) {
    return NextResponse.json({ error: "no organization" }, { status: 403 });
  }

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
    category_id: string | null;
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
      // Scope storage path per organization to avoid cross-tenant collisions.
      const path = `${orgId}/${b.bookId}.jpg`;
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
      status: "available",
      category_id: b.categoryId ?? null,
    });
  }

  // organization_id is auto-filled by the column DEFAULT (default_org_id())
  const { error: insertError } = await supabase.from("books").insert(rows);
  if (insertError) {
    console.error("[books] insert error", insertError);
    const isDup =
      insertError.code === "23505" ||
      /duplicate key/i.test(insertError.message);
    return NextResponse.json(
      {
        error: isDup
          ? "書籍編號重複（可能有另一位管理員同時入庫）。請回到掃描頁重新「結束入庫」以重新編號。"
          : insertError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, count: rows.length });
}
