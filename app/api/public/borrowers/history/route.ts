import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrg, normalizePhone } from "@/lib/publicOrg";
import { allowRequest, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Body = {
  slug?: string;
  phone?: string;
};

type BorrowerRow = {
  id: string;
  display_name: string;
  last_active_at: string | null;
  created_at: string;
};

type HoldingRow = {
  book_id: string;
  title: string;
  image_url: string | null;
  current_location: string | null;
  category: { name: string } | null;
};

type RecordRow = {
  id: string;
  book_id: string;
  borrowed_at: string;
  returned_at: string | null;
  location_note: string | null;
};

type BookRow = {
  book_id: string;
  title: string;
  image_url: string | null;
  category: { name: string } | null;
};

/**
 * 公開「我的紀錄」查詢端點：使用手機號碼在單一 org 範圍內，
 * 回傳該借閱人的目前持有書、所有借閱紀錄與已歸還紀錄所需的書本資訊。
 *
 * 與 `/api/admin/borrowers/[id]` 不同的是：
 *  - 完全匿名（沒有 Supabase session），所以走 service-role admin client
 *  - 以 (organization_id, phone) 為查詢條件，其他 org 的紀錄查不到
 *  - 不回傳 email / 完整手機，避免有人透過試打手機號碼掃出他人 PII
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // 比 lookup 嚴一點：history 一次回傳更多欄位，且使用者一般只查自己一兩次。
  const limit = allowRequest("public.history", ip, {
    capacity: 5,
    refillPerSec: 10 / 60,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "請求過於頻繁，請稍候再試" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
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
    return NextResponse.json(
      { error: "organization not available" },
      { status: 404 },
    );
  }
  if (!org.public_borrow_enabled) {
    return NextResponse.json(
      { error: "public flow disabled for this organization" },
      { status: 403 },
    );
  }

  const { phone, ok } = normalizePhone(body.phone ?? "");
  if (!ok) {
    return NextResponse.json({ error: "phone invalid" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: borrower, error: borrowerErr } = await admin
    .from("borrowers")
    .select("id, display_name, last_active_at, created_at")
    .eq("organization_id", org.id)
    .eq("phone", phone)
    .maybeSingle<BorrowerRow>();
  if (borrowerErr) {
    console.error("[public/borrowers/history] borrower lookup failed", borrowerErr);
    return NextResponse.json({ error: borrowerErr.message }, { status: 500 });
  }

  // 沒有借閱紀錄也回 200，由前端顯示「查無紀錄」。
  if (!borrower) {
    return NextResponse.json({
      borrower: null,
      holding: [],
      records: [],
      books: {},
    });
  }

  const [holdingRes, recordsRes] = await Promise.all([
    admin
      .from("books")
      .select(
        "book_id, title, image_url, current_location, category:categories(name)",
      )
      .eq("organization_id", org.id)
      .eq("current_holder_id", borrower.id),
    admin
      .from("borrow_records")
      .select("id, book_id, borrowed_at, returned_at, location_note")
      .eq("organization_id", org.id)
      .eq("borrower_id", borrower.id)
      .order("borrowed_at", { ascending: false })
      .limit(200),
  ]);
  if (holdingRes.error) {
    return NextResponse.json(
      { error: holdingRes.error.message },
      { status: 500 },
    );
  }
  if (recordsRes.error) {
    return NextResponse.json(
      { error: recordsRes.error.message },
      { status: 500 },
    );
  }

  const holdingRaw = (holdingRes.data ?? []) as unknown as HoldingRow[];
  const holding = holdingRaw.map((b) => ({
    book_id: b.book_id,
    title: b.title,
    image_url: b.image_url,
    current_location: b.current_location,
    category_name: b.category?.name ?? null,
  }));

  const records = (recordsRes.data ?? []) as RecordRow[];
  // 紀錄中參照到、但已不在 borrower 持有清單裡的書（例如已歸還的）也要把
  // 標題/封面拉回來，讓借/還紀錄列表能直接顯示書名而不是 book_id。
  const recordBookIds = Array.from(
    new Set(
      records
        .map((r) => r.book_id)
        .filter((id) => !holding.some((h) => h.book_id === id)),
    ),
  );

  const books: Record<
    string,
    {
      book_id: string;
      title: string;
      image_url: string | null;
      category_name: string | null;
    }
  > = {};
  for (const h of holding) {
    books[h.book_id] = {
      book_id: h.book_id,
      title: h.title,
      image_url: h.image_url,
      category_name: h.category_name,
    };
  }
  if (recordBookIds.length > 0) {
    const { data: extraBooks, error: extraErr } = await admin
      .from("books")
      .select("book_id, title, image_url, category:categories(name)")
      .eq("organization_id", org.id)
      .in("book_id", recordBookIds);
    if (extraErr) {
      console.error("[public/borrowers/history] book lookup failed", extraErr);
    } else {
      for (const b of (extraBooks ?? []) as unknown as BookRow[]) {
        books[b.book_id] = {
          book_id: b.book_id,
          title: b.title,
          image_url: b.image_url,
          category_name: b.category?.name ?? null,
        };
      }
    }
  }

  // 沿用 lookup 這個 action（DB CHECK 限定的列舉值），用 payload.kind
  // 標記是「我的紀錄」這條路徑來的，避免要做 schema migration。
  void admin
    .from("public_action_logs")
    .insert({
      organization_id: org.id,
      action: "lookup",
      borrower_id: borrower.id,
      ip,
      user_agent: req.headers.get("user-agent") ?? null,
      payload: {
        kind: "history",
        holding_count: holding.length,
        records_count: records.length,
      },
    })
    .then(({ error: logErr }) => {
      if (logErr)
        console.warn("[public/borrowers/history] log failed", logErr);
    });

  return NextResponse.json({
    borrower: {
      id: borrower.id,
      display_name: borrower.display_name,
      last_active_at: borrower.last_active_at,
      created_at: borrower.created_at,
    },
    holding,
    records,
    books,
  });
}
