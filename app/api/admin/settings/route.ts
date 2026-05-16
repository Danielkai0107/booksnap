import { NextRequest, NextResponse } from "next/server";
import { requireUnitSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTwCity } from "@/lib/cities";

export const runtime = "nodejs";

/**
 * Update the caller's organization. Two concerns share this endpoint:
 *
 *  1. **Basic unit info** (name, city, contact email/phone) — the fields the
 *     unit filled in at registration time and may want to keep up to date.
 *  2. **Public-link toggles** (`public_borrow_enabled`, `public_catalog_enabled`)
 *     which gate the anonymous `/o/{slug}` flow.
 *
 * RLS allows unit users to update their own org row, but we additionally
 * resolve the org id from the session to avoid trusting any client-supplied
 * id and use the service-role client because the toggles also affect the
 * public surface (anonymous reads).
 *
 * NOTE: `contact_email` is intentionally NOT synced to `auth.users.email`.
 * Changing the login email requires a separate verified flow, so this field is
 * purely for "how can we reach you about your unit" purposes.
 */
export async function PATCH(req: NextRequest) {
  const session = await requireUnitSession();
  const orgId = session.organization!.id;

  let body: {
    name?: string;
    city?: string;
    contact_email?: string;
    contact_phone?: string;
    public_borrow_enabled?: boolean;
    public_catalog_enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "請輸入單位名稱" }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json(
        { error: "單位名稱過長（最多 120 字）" },
        { status: 400 }
      );
    }
    patch.name = name;
  }

  if (typeof body.city === "string") {
    const city = body.city.trim();
    if (!isTwCity(city)) {
      return NextResponse.json({ error: "請選擇有效的縣市" }, { status: 400 });
    }
    patch.city = city;
  }

  if (typeof body.contact_email === "string") {
    const email = body.contact_email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "請輸入有效的聯絡 Email" },
        { status: 400 }
      );
    }
    patch.contact_email = email;
  }

  if (typeof body.contact_phone === "string") {
    const phone = body.contact_phone.trim();
    if (!phone) {
      return NextResponse.json({ error: "請輸入聯絡電話" }, { status: 400 });
    }
    if (phone.length > 40) {
      return NextResponse.json({ error: "聯絡電話格式過長" }, { status: 400 });
    }
    patch.contact_phone = phone;
  }

  if (typeof body.public_borrow_enabled === "boolean") {
    patch.public_borrow_enabled = body.public_borrow_enabled;
  }
  if (typeof body.public_catalog_enabled === "boolean") {
    patch.public_catalog_enabled = body.public_catalog_enabled;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .update(patch)
    .eq("id", orgId)
    .select(
      "name, city, contact_email, contact_phone, public_slug, public_borrow_enabled, public_catalog_enabled"
    )
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ organization: data });
}
