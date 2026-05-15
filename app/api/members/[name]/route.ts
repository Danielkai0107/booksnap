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

export async function PATCH(req: NextRequest, { params }: Params) {
  const { name: rawName } = await params;
  const oldName = decodeURIComponent(rawName);
  const supabase = await createClient();

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const newName = body.name?.trim();
  if (!newName) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (newName === oldName) {
    return NextResponse.json({ member: { name: newName } });
  }

  const { data: existing, error: existingErr } = await supabase
    .from("members")
    .select("name")
    .eq("name", newName)
    .maybeSingle();
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ error: "成員名稱已存在" }, { status: 409 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("members")
    .update({ name: newName })
    .eq("name", oldName)
    .select("name, created_at")
    .single();
  if (updateErr) {
    const isDup =
      updateErr.code === "23505" || /duplicate key/i.test(updateErr.message);
    return NextResponse.json(
      { error: isDup ? "成員名稱已存在" : updateErr.message },
      { status: isDup ? 409 : 500 }
    );
  }

  const { error: booksErr } = await supabase
    .from("books")
    .update({ current_holder: newName })
    .eq("current_holder", oldName);
  if (booksErr) {
    return NextResponse.json(
      { error: `成員已更名，但更新書本持有人失敗：${booksErr.message}` },
      { status: 500 }
    );
  }

  const { error: recordsErr } = await supabase
    .from("borrow_records")
    .update({ borrower_name: newName })
    .eq("borrower_name", oldName);
  if (recordsErr) {
    return NextResponse.json(
      { error: `成員已更名，但更新借閱紀錄失敗：${recordsErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ member: updated });
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
