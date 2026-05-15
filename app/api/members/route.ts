import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabase
    .from("members")
    .select("name, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ members: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("members")
    .insert({ name })
    .select("name, created_at")
    .single();

  if (error) {
    const isDup =
      error.code === "23505" || /duplicate key/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "成員名稱已存在" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  return NextResponse.json({ member: data });
}
