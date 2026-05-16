import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrg } from "@/lib/publicOrg";
import { maskPhonePublic } from "@/lib/mask";
import { allowRequest, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Public read endpoint scoped to a single organization. Two modes:
 *
 *  - `?slug=X&bookId=Y` → single book lookup. Used by the scan flow to show
 *    the freshly-scanned book before the user confirms borrow / return.
 *  - `?slug=X[&q=keyword]` → catalog list. Used by `/o/{slug}/books` (only
 *    when `public_catalog_enabled` is true).
 *
 * The borrower's phone is always masked here so anonymous readers can find
 * "their" entry without doxxing other readers.
 */
export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  // Catalog/lookup is read-only and called by the scan loop, so the bucket
  // is more generous than the mutating endpoints.
  const limit = allowRequest("public.books", ip, {
    capacity: 30,
    refillPerSec: 60 / 60,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "請求過於頻繁，請稍候再試" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  const { searchParams } = req.nextUrl;
  const slug = searchParams.get("slug")?.trim() ?? "";
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }
  const org = await getPublicOrg(slug);
  if (!org) {
    return NextResponse.json({ error: "organization not available" }, { status: 404 });
  }

  const admin = createAdminClient();
  const bookId = searchParams.get("bookId")?.trim();

  if (bookId) {
    const { data, error } = await admin
      .from("books")
      .select(
        "book_id, title, image_url, status, shelf_id, current_holder, current_location, current_holder_id, category_id, category:categories(name), borrower:borrowers!books_current_holder_id_fkey(phone)"
      )
      .eq("organization_id", org.id)
      .eq("book_id", bookId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "book not found" }, { status: 404 });
    }
    return NextResponse.json({ book: shapeBook(data) });
  }

  // Catalog mode is gated by the org-level switch.
  if (!org.public_catalog_enabled) {
    return NextResponse.json(
      { error: "catalog disabled for this organization" },
      { status: 403 }
    );
  }

  const q = searchParams.get("q")?.trim() ?? "";
  let query = admin
    .from("books")
    .select(
      "book_id, title, image_url, status, shelf_id, current_holder, current_location, current_holder_id, category_id, category:categories(name), borrower:borrowers!books_current_holder_id_fkey(phone)"
    )
    .eq("organization_id", org.id)
    .order("checkin_time", { ascending: false })
    .limit(200);
  if (q) {
    // Match on title or book_id; ilike is fine because the result is capped.
    const safe = q.replace(/[,%]/g, " ");
    query = query.or(
      `title.ilike.%${safe}%,book_id.ilike.%${safe}%`
    );
  }
  // Fetch the org's full category list in parallel so the catalog filter can
  // include categories that no book is currently tagged with — otherwise the
  // dropdown only shows categories derived from the books on the current page.
  const [booksRes, categoriesRes] = await Promise.all([
    query,
    admin
      .from("categories")
      .select("id, name, sort_order")
      .eq("organization_id", org.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (booksRes.error) {
    return NextResponse.json({ error: booksRes.error.message }, { status: 500 });
  }
  if (categoriesRes.error) {
    console.error("[public/books] categories fetch failed", categoriesRes.error);
  }
  return NextResponse.json({
    books: (booksRes.data ?? []).map(shapeBook),
    categories: (categoriesRes.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
    })),
  });
}

type RawBook = {
  book_id: string;
  title: string;
  image_url: string | null;
  status: string;
  shelf_id: string | null;
  current_holder: string | null;
  current_location: string | null;
  current_holder_id: string | null;
  category_id: string | null;
  category: { name: string } | null;
  borrower: { phone: string } | null;
};

function shapeBook(raw: unknown) {
  const b = raw as RawBook;
  return {
    book_id: b.book_id,
    title: b.title,
    image_url: b.image_url,
    status: b.status,
    shelf_id: b.shelf_id,
    current_holder: b.current_holder,
    current_location: b.current_location,
    current_holder_phone_masked: b.borrower?.phone
      ? maskPhonePublic(b.borrower.phone)
      : null,
    category_name: b.category?.name ?? null,
  };
}
