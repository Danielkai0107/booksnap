import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);
  const supabase = await createClient();

  const [memberRes, holdingRes, recordsRes] = await Promise.all([
    supabase.from("members").select("*").eq("name", name).maybeSingle(),
    supabase
      .from("books")
      .select("book_id, title, image_url, current_holder")
      .eq("current_holder", name),
    supabase
      .from("borrow_records")
      .select("*")
      .eq("borrower_name", name)
      .order("borrowed_at", { ascending: false }),
  ]);

  if (memberRes.error) {
    return NextResponse.json(
      { error: memberRes.error.message },
      { status: 500 }
    );
  }
  if (!memberRes.data) {
    return NextResponse.json({ error: "member not found" }, { status: 404 });
  }

  return NextResponse.json({
    member: memberRes.data,
    holding: holdingRes.data ?? [],
    records: recordsRes.data ?? [],
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);
  const supabase = await createClient();

  const { count } = await supabase
    .from("books")
    .select("*", { count: "exact", head: true })
    .eq("current_holder", name);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "此成員目前還有借出未還的書，無法刪除" },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("members").delete().eq("name", name);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
