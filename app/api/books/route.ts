import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type IncomingBook = {
  title: string;
  bookId: string;
  /** 相機拍的 base64；null 代表使用 remoteImageUrl 而不上傳。 */
  imageBase64?: string | null;
  /** Google Books 提供的封面 URL；若有則優先寫入 image_url。 */
  remoteImageUrl?: string | null;
  categoryId?: string | null;
  isbn?: string | null;
  authors?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
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
    isbn: string | null;
    authors: string | null;
    publisher: string | null;
    published_date: string | null;
  }> = [];

  for (const b of books) {
    if (!b.bookId || !b.title) {
      return NextResponse.json(
        { error: "each book requires bookId and title" },
        { status: 400 }
      );
    }
    let imageUrl: string | null = null;
    // 封面來源優先順序：
    //   1. Google Books 給的 thumbnail（直接寫入，不上傳 storage）
    //   2. 相機拍的 base64（上傳到 storage 再用 public URL）
    if (b.remoteImageUrl) {
      imageUrl = b.remoteImageUrl;
    } else if (b.imageBase64) {
      try {
        const { buffer, contentType } = dataUrlToBuffer(b.imageBase64);
        // ⚠️ 不能用 `${orgId}/${bookId}.jpg`：
        // bookId 流水號會在刪書後被回收重用（例如刪掉今天最後一本），
        // 新書 upsert 到同 path 雖然會覆蓋檔案，但 Supabase Storage
        // 的 CDN 與瀏覽器會 cache 同一個 public URL，使用者就會持續
        // 看到「舊書留下的圖」。改用 timestamp 後綴保證每次都是新 URL。
        const stamp = Date.now();
        const path = `${orgId}/${b.bookId}-${stamp}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("book-covers")
          .upload(path, buffer, {
            contentType,
            upsert: false,
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
    }

    const cleanedIsbn = b.isbn?.replace(/[-\s]/g, "") || null;
    // published_date 欄位是 DATE，Google 常常給 "2014" 或 "2014-10"，
    // Postgres 不接受純年份，所以這裡只取得到月日才寫入，否則塞 null。
    const publishedDate =
      b.publishedDate && /^\d{4}-\d{2}-\d{2}$/.test(b.publishedDate)
        ? b.publishedDate
        : null;

    rows.push({
      book_id: b.bookId,
      title: b.title,
      admin_name: adminName,
      image_url: imageUrl,
      status: "available",
      category_id: b.categoryId ?? null,
      isbn: cleanedIsbn,
      authors: b.authors?.trim() || null,
      publisher: b.publisher?.trim() || null,
      published_date: publishedDate,
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
