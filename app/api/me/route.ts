import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_QUOTAS, getPeriodRange, type OrgPlan } from "@/lib/plans";

export const runtime = "nodejs";

type UsagePayload = {
  ai: { used: number; limit: number; periodEnd: string };
  books: { count: number; limit: number };
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const org = session.organization;
  const plan: OrgPlan | null = org?.plan ?? null;

  let usage: UsagePayload | null = null;
  if (org && plan) {
    const anchorISO = org.approved_at ?? org.created_at;
    const { start, end } = getPeriodRange(anchorISO);
    const quotas = PLAN_QUOTAS[plan];

    const admin = createAdminClient();
    const [aiRes, booksRes] = await Promise.all([
      admin
        .from("ai_usage_logs")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .gte("created_at", start.toISOString()),
      admin
        .from("books")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id),
    ]);

    usage = {
      ai: {
        used: aiRes.count ?? 0,
        limit: quotas.ai,
        periodEnd: end.toISOString(),
      },
      books: {
        count: booksRes.count ?? 0,
        limit: quotas.books,
      },
    };
  }

  return NextResponse.json({
    orgId: org?.id ?? null,
    orgName: org?.name ?? null,
    publicSlug: org?.public_slug ?? null,
    role: session.profile.role,
    email: session.email,
    plan,
    usage,
  });
}
