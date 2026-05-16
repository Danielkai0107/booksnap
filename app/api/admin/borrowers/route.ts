import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Admin-side list of borrowers for the caller's organization.
 *
 * Borrowers are populated automatically when readers borrow a book on the
 * public `/o/{slug}` entry, so this endpoint is read-only — there is no
 * matching POST. Use `holdingCount` to surface "currently borrowed" stats.
 *
 * RLS scopes everything to `default_org_id()` so the cookie-bound client is
 * sufficient (no service-role needed).
 */
export async function GET() {
  const supabase = await createClient();

  const [borrowersRes, holdingsRes] = await Promise.all([
    supabase
      .from("borrowers")
      .select("id, phone, display_name, email, last_active_at, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("books")
      .select("current_holder_id")
      .not("current_holder_id", "is", null),
  ]);

  if (borrowersRes.error) {
    return NextResponse.json(
      { error: borrowersRes.error.message },
      { status: 500 }
    );
  }
  if (holdingsRes.error) {
    return NextResponse.json(
      { error: holdingsRes.error.message },
      { status: 500 }
    );
  }

  const holdingCounts = new Map<string, number>();
  for (const row of holdingsRes.data ?? []) {
    const id = (row as { current_holder_id: string | null }).current_holder_id;
    if (!id) continue;
    holdingCounts.set(id, (holdingCounts.get(id) ?? 0) + 1);
  }

  const borrowers = (borrowersRes.data ?? []).map((b) => ({
    id: b.id as string,
    phone: b.phone as string,
    display_name: b.display_name as string,
    email: (b.email as string | null) ?? null,
    last_active_at: (b.last_active_at as string | null) ?? null,
    created_at: b.created_at as string,
    holding_count: holdingCounts.get(b.id as string) ?? 0,
  }));

  return NextResponse.json({ borrowers });
}
