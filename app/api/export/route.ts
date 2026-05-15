import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase, BookRow } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("checkin_time", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as BookRow[];

  const sheetRows = rows.map((b) => ({
    書籍編號: b.book_id,
    書名: b.title,
    入庫人員: b.admin_name,
    入庫時間: b.checkin_time
      ? new Date(b.checkin_time).toLocaleString("zh-TW")
      : "",
    狀態: b.status === "available" ? "在庫" : "已借出",
    目前持有人: b.current_holder ?? "",
    書架位置: b.shelf_id ?? "",
  }));

  const headerOrder = [
    "書籍編號",
    "書名",
    "入庫人員",
    "入庫時間",
    "狀態",
    "目前持有人",
    "書架位置",
  ];

  const worksheet =
    sheetRows.length > 0
      ? XLSX.utils.json_to_sheet(sheetRows, { header: headerOrder })
      : XLSX.utils.aoa_to_sheet([headerOrder]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Books");

  const buffer: Buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=books-export.xlsx",
      "Cache-Control": "no-store",
    },
  });
}
