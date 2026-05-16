import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrg } from "@/lib/publicOrg";
import { allowRequest, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Body = {
  slug?: string;
  bookIds?: string[];
};

/**
 * Public return endpoint. No identity required — the QR carries the org+book
 * scope and we close the borrow record using `current_holder_id` already
 * stored on the book. This matches the user's intent: "還書只需掃碼不需再先
 * 輸入人員".
 *
 * For each book, we:
 *  - reject anything cross-tenant or unknown
 *  - reject anything already `available` (nothing to return)
 *  - reset `status`, `current_holder*` fields
 *  - close the matching open borrow_record (last unreturned row for the same
 *    book_id + organization). Doing it via `book_id` keeps it safe even if
 *    the historical holder rotation looks weird.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = allowRequest("public.return", ip, {
    capacity: 3,
    refillPerSec: 10 / 60,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "請求過於頻繁，請稍候再試" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const slug = body.slug?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }
  const org = await getPublicOrg(slug);
  if (!org) {
    return NextResponse.json({ error: "organization not available" }, { status: 404 });
  }
  if (!org.public_borrow_enabled) {
    return NextResponse.json(
      { error: "public flow disabled for this organization" },
      { status: 403 }
    );
  }

  const bookIds = (body.bookIds ?? [])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  if (bookIds.length === 0) {
    return NextResponse.json({ error: "bookIds required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: candidates, error: fetchErr } = await admin
    .from("books")
    .select("book_id, title, status, current_holder_id")
    .eq("organization_id", org.id)
    .in("book_id", bookIds);
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  const byId = new Map(
    (candidates ?? []).map((b) => [b.book_id as string, b])
  );

  const accepted: string[] = [];
  const rejected: Array<{ book_id: string; reason: string; title?: string }> = [];
  for (const id of bookIds) {
    const row = byId.get(id);
    if (!row) {
      rejected.push({ book_id: id, reason: "not_found" });
      continue;
    }
    if (row.status !== "borrowed") {
      rejected.push({
        book_id: id,
        title: (row.title as string) ?? undefined,
        reason: "not_borrowed",
      });
      continue;
    }
    accepted.push(id);
  }

  if (accepted.length === 0) {
    return NextResponse.json({
      success: false,
      returned_count: 0,
      accepted: [],
      rejected,
    });
  }

  // Mark accepted books as available again, guarded on status so we don't
  // accidentally race against a concurrent admin edit.
  const { data: updatedBooks, error: updateErr } = await admin
    .from("books")
    .update({
      status: "available",
      current_holder_id: null,
      current_holder: null,
      current_location: null,
      return_time: now,
    })
    .eq("organization_id", org.id)
    .eq("status", "borrowed")
    .in("book_id", accepted)
    .select("book_id");
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  const finallyReturned = (updatedBooks ?? []).map((b) => b.book_id as string);
  for (const id of accepted) {
    if (!finallyReturned.includes(id)) {
      rejected.push({ book_id: id, reason: "race_lost" });
    }
  }

  // Close the matching open borrow_record per book. There should be exactly
  // one row per book with `returned_at IS NULL` (enforced by the borrow flow
  // setting status=borrowed atomically), but we still update via the same
  // filter to be defensive.
  if (finallyReturned.length > 0) {
    const { error: closeErr } = await admin
      .from("borrow_records")
      .update({ returned_at: now })
      .eq("organization_id", org.id)
      .is("returned_at", null)
      .in("book_id", finallyReturned);
    if (closeErr) {
      console.error("[public/return] close records failed", closeErr);
      return NextResponse.json(
        {
          error: closeErr.message,
          returned_count: finallyReturned.length,
          accepted: finallyReturned,
          rejected,
        },
        { status: 500 }
      );
    }
  }

  void admin
    .from("public_action_logs")
    .insert({
      organization_id: org.id,
      action: "return",
      borrower_id: null,
      ip,
      user_agent: req.headers.get("user-agent") ?? null,
      payload: {
        accepted: finallyReturned,
        rejected,
      },
    })
    .then(({ error: logErr }) => {
      if (logErr) console.warn("[public/return] log failed", logErr);
    });

  return NextResponse.json({
    success: true,
    returned_count: finallyReturned.length,
    accepted: finallyReturned,
    rejected,
  });
}
