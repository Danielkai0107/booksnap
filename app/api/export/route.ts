import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * 匯出書籍清單為 Excel。
 *
 * 範圍：限定當前登入使用者所屬組織。
 *
 * 可選 query params（與 /admin 頁面的篩選對齊，what-you-see-is-what-you-export）：
 *   - q        書名或書籍編號（不分大小寫子字串比對）
 *   - category 分類 UUID
 *   - status   `available` | `borrowed`
 *
 * 欄位與 /admin 詳情頁顯示一致，並補上後來新增的 ISBN / 作者 / 出版社 /
 * 出版日期 / 借出位置 / 歸還時間 等欄位（舊版只有 7 欄）。
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const org = session.organization;
  if (!org) {
    return NextResponse.json({ error: "no organization" }, { status: 403 });
  }

  const url = req.nextUrl;
  const q = url.searchParams.get("q")?.trim() ?? "";
  const categoryId = url.searchParams.get("category")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";

  const admin = createAdminClient();
  let query = admin
    .from("books")
    .select(
      "book_id, title, admin_name, checkin_time, return_time, status, shelf_id, current_holder, current_location, isbn, authors, publisher, published_date, category:categories(name)",
    )
    .eq("organization_id", org.id)
    .order("checkin_time", { ascending: false });

  if (categoryId) query = query.eq("category_id", categoryId);
  if (status === "available" || status === "borrowed") {
    query = query.eq("status", status);
  }
  if (q) {
    // 與 admin 頁面一致：書名或編號子字串。Supabase 的 `ilike` 即不分大小寫。
    // `.or()` 內的逗號 / % 需轉義；q 來自使用者輸入，逐字 escape。
    const safe = q.replace(/([,()*])/g, "\\$1");
    query = query.or(`title.ilike.%${safe}%,book_id.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    book_id: string;
    title: string;
    admin_name: string | null;
    checkin_time: string | null;
    return_time: string | null;
    status: string | null;
    shelf_id: string | null;
    current_holder: string | null;
    current_location: string | null;
    isbn: string | null;
    authors: string | null;
    publisher: string | null;
    published_date: string | null;
    category: { name: string } | { name: string }[] | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  function categoryName(c: Row["category"]): string {
    if (!c) return "";
    if (Array.isArray(c)) return c[0]?.name ?? "";
    return c.name ?? "";
  }

  function fmtDateTime(s: string | null): string {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-TW", { hour12: false });
  }

  const sheetRows = rows.map((b) => ({
    書籍編號: b.book_id,
    書名: b.title,
    分類: categoryName(b.category),
    ISBN: b.isbn ?? "",
    作者: b.authors ?? "",
    出版社: b.publisher ?? "",
    出版日期: b.published_date ?? "",
    狀態: b.status === "available" ? "在庫" : "已借出",
    目前持有人: b.current_holder ?? "",
    借出位置: b.current_location ?? "",
    書架編號: b.shelf_id ?? "",
    入庫人員: b.admin_name ?? "",
    入庫時間: fmtDateTime(b.checkin_time),
    最近歸還時間: fmtDateTime(b.return_time),
  }));

  const headerOrder = [
    "書籍編號",
    "書名",
    "分類",
    "ISBN",
    "作者",
    "出版社",
    "出版日期",
    "狀態",
    "目前持有人",
    "借出位置",
    "書架編號",
    "入庫人員",
    "入庫時間",
    "最近歸還時間",
  ];

  const worksheet =
    sheetRows.length > 0
      ? XLSX.utils.json_to_sheet(sheetRows, { header: headerOrder })
      : XLSX.utils.aoa_to_sheet([headerOrder]);

  // 給每欄一個合理寬度，讓檔案打開即可閱讀（不必再手動拉欄寬）。
  worksheet["!cols"] = [
    { wch: 12 }, // 書籍編號
    { wch: 32 }, // 書名
    { wch: 12 }, // 分類
    { wch: 16 }, // ISBN
    { wch: 18 }, // 作者
    { wch: 16 }, // 出版社
    { wch: 12 }, // 出版日期
    { wch: 8 }, // 狀態
    { wch: 14 }, // 目前持有人
    { wch: 18 }, // 借出位置
    { wch: 10 }, // 書架編號
    { wch: 12 }, // 入庫人員
    { wch: 20 }, // 入庫時間
    { wch: 20 }, // 最近歸還時間
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "書籍清單");

  const buffer: Buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  // 檔名：booksnap-{org slug}-{YYYYMMDD}.xlsx，避免多次下載互相覆蓋。
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const slugPart = (org.public_slug || "books").replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `booksnap-${slugPart}-${stamp}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
