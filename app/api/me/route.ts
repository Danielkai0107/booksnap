import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    orgId: session.organization?.id ?? null,
    orgName: session.organization?.name ?? null,
    publicSlug: session.organization?.public_slug ?? null,
    role: session.profile.role,
    email: session.email,
  });
}
