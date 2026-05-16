import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrg, normalizePhone } from "@/lib/publicOrg";
import { allowRequest, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Body = {
  slug?: string;
  phone?: string;
};

/**
 * Looks up a borrower by phone within a public org. Used by the borrow flow's
 * step 1 to either pre-fill display name / email or prompt for them on first
 * contact. Always responds 200 — `borrower: null` simply means "no record".
 *
 * Always uses the service-role client because the request is anonymous (no
 * Supabase session cookie). Tenant scoping is enforced by resolving the org
 * id from `slug` server-side and ignoring any client-supplied org id.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = allowRequest("public.lookup", ip, {
    capacity: 5,
    refillPerSec: 20 / 60,
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

  const { phone, ok } = normalizePhone(body.phone ?? "");
  if (!ok) {
    return NextResponse.json({ error: "phone invalid" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("borrowers")
    .select("id, display_name, email")
    .eq("organization_id", org.id)
    .eq("phone", phone)
    .maybeSingle();
  if (error) {
    console.error("[public/borrowers/lookup] failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fire-and-forget audit; if logging fails we still serve the lookup.
  void admin
    .from("public_action_logs")
    .insert({
      organization_id: org.id,
      action: "lookup",
      borrower_id: (data?.id as string | undefined) ?? null,
      ip,
      user_agent: req.headers.get("user-agent") ?? null,
      payload: { found: !!data },
    })
    .then(({ error: logErr }) => {
      if (logErr) console.warn("[public/borrowers/lookup] log failed", logErr);
    });

  return NextResponse.json({
    borrower: data
      ? {
          id: data.id as string,
          display_name: data.display_name as string,
          email: (data.email as string | null) ?? null,
        }
      : null,
  });
}
