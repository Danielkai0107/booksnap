import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrg, normalizePhone } from "@/lib/publicOrg";
import { allowRequest, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Body = {
  slug?: string;
  phone?: string;
  displayName?: string;
  email?: string | null;
  locationNote?: string | null;
  bookIds?: string[];
};

/**
 * Public borrow endpoint. Behaviour:
 *  1. Resolve org by slug (rejects unknown / suspended orgs).
 *  2. Upsert the borrower keyed by `(organization_id, phone)` so first-time
 *     readers create a record and returning readers get their display name
 *     / email refreshed if they changed it.
 *  3. Validate every requested book belongs to this org and is currently
 *     `available`. Books missing or already borrowed get reported back as
 *     `rejected` so the UI can show "this one was taken right before you".
 *  4. Update the books and insert one borrow_record per accepted book within
 *     the same transaction (best-effort sequential — Supabase JS doesn't
 *     expose multi-statement TX, but the unique constraint on the books'
 *     status check protects against double-borrow).
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = allowRequest("public.borrow", ip, {
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
      { error: "public borrowing disabled for this organization" },
      { status: 403 }
    );
  }

  const { phone, ok: phoneOk } = normalizePhone(body.phone ?? "");
  if (!phoneOk) {
    return NextResponse.json({ error: "phone invalid" }, { status: 400 });
  }

  const displayName = (body.displayName ?? "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "displayName required" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase() || null;
  const locationNote = body.locationNote?.trim() || null;

  const bookIds = (body.bookIds ?? [])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  if (bookIds.length === 0) {
    return NextResponse.json({ error: "bookIds required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1) Upsert borrower keyed by (organization_id, phone). The unique
  //    constraint guarantees we end up with a single canonical row. Refresh
  //    consent_at on every borrow because every borrow re-confirms consent.
  const { data: borrowerRow, error: borrowerErr } = await admin
    .from("borrowers")
    .upsert(
      {
        organization_id: org.id,
        phone,
        display_name: displayName,
        email,
        last_active_at: now,
        consent_at: now,
      },
      { onConflict: "organization_id,phone" }
    )
    .select("id")
    .single();
  if (borrowerErr || !borrowerRow) {
    console.error("[public/borrow] upsert borrower failed", borrowerErr);
    return NextResponse.json(
      { error: borrowerErr?.message ?? "borrower upsert failed" },
      { status: 500 }
    );
  }
  const borrowerId = borrowerRow.id as string;

  // 2) Fetch the candidate books scoped to this org. Anything missing here is
  //    either cross-tenant or deleted — both treated as "not found".
  const { data: candidateBooks, error: booksFetchErr } = await admin
    .from("books")
    .select("book_id, title, status, current_holder_id")
    .eq("organization_id", org.id)
    .in("book_id", bookIds);
  if (booksFetchErr) {
    return NextResponse.json(
      { error: booksFetchErr.message },
      { status: 500 }
    );
  }
  const knownById = new Map(
    (candidateBooks ?? []).map((b) => [b.book_id as string, b])
  );

  const accepted: string[] = [];
  const rejected: Array<{ book_id: string; reason: string; title?: string }> = [];

  for (const id of bookIds) {
    const row = knownById.get(id);
    if (!row) {
      rejected.push({ book_id: id, reason: "not_found" });
      continue;
    }
    if (row.status !== "available") {
      rejected.push({
        book_id: id,
        title: (row.title as string) ?? undefined,
        reason: "already_borrowed",
      });
      continue;
    }
    accepted.push(id);
  }

  if (accepted.length === 0) {
    return NextResponse.json({
      success: false,
      borrowed_count: 0,
      accepted: [],
      rejected,
    });
  }

  // 3) Mark accepted books as borrowed. Use a status guard in the WHERE clause
  //    so a race with another concurrent borrow (or an admin-side update) is
  //    detected via affected-row mismatch.
  const { data: updatedBooks, error: updateErr } = await admin
    .from("books")
    .update({
      status: "borrowed",
      current_holder_id: borrowerId,
      current_holder: displayName,
      current_location: locationNote,
    })
    .eq("organization_id", org.id)
    .eq("status", "available")
    .in("book_id", accepted)
    .select("book_id");
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  const finallyAccepted = new Set(
    (updatedBooks ?? []).map((b) => b.book_id as string)
  );
  for (const id of accepted) {
    if (!finallyAccepted.has(id)) {
      rejected.push({ book_id: id, reason: "race_lost" });
    }
  }

  // 4) Write one borrow_record per accepted book. Failure here would leave
  //    book.status updated without an audit row — log it so we can spot it.
  if (finallyAccepted.size > 0) {
    const records = Array.from(finallyAccepted).map((book_id) => ({
      organization_id: org.id,
      book_id,
      borrower_id: borrowerId,
      borrowed_at: now,
      location_note: locationNote,
    }));
    const { error: insertErr } = await admin
      .from("borrow_records")
      .insert(records);
    if (insertErr) {
      console.error(
        "[public/borrow] insert records failed (books already updated)",
        insertErr
      );
      return NextResponse.json(
        {
          error: insertErr.message,
          borrowed_count: finallyAccepted.size,
          accepted: Array.from(finallyAccepted),
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
      action: "borrow",
      borrower_id: borrowerId,
      ip,
      user_agent: req.headers.get("user-agent") ?? null,
      payload: {
        accepted: Array.from(finallyAccepted),
        rejected,
        location_note: locationNote,
      },
    })
    .then(({ error: logErr }) => {
      if (logErr) console.warn("[public/borrow] log failed", logErr);
    });

  return NextResponse.json({
    success: true,
    borrowed_count: finallyAccepted.size,
    accepted: Array.from(finallyAccepted),
    rejected,
  });
}
