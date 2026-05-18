import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ISSUE_REPORT_REASON_MAX,
  ISSUE_REPORT_REASON_MIN,
  isIssueReportCategory,
  issueReportCategoryLabel,
} from "@/lib/issue-report";
import { buildIssueReportEmailHtml, sendEmail } from "@/lib/mail/resend";
import { allowRequest, clientIp } from "@/lib/rateLimit";
import { listSuperAdminRecipientEmails } from "@/lib/super-admin-emails";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "請先登入後再試一次" },
      { status: 401 },
    );
  }
  if (session.profile.role === "super_admin") {
    return NextResponse.json(
      { error: "目前帳號無法使用此功能" },
      { status: 403 },
    );
  }
  const org = session.organization;
  if (!org || org.status !== "approved") {
    return NextResponse.json(
      { error: "單位尚未開通，暫時無法送出" },
      { status: 403 },
    );
  }

  const ip = clientIp(req);
  const limit = allowRequest("issue-report", ip, {
    capacity: 5,
    refillPerSec: 5 / 3600,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "操作太頻繁，請稍後再試" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: { category?: string; reason?: string; pageUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "送出失敗，請重新整理後再試" },
      { status: 400 },
    );
  }

  const category = String(body.category ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const pageUrl =
    typeof body.pageUrl === "string" ? body.pageUrl.trim().slice(0, 500) : "";

  if (!isIssueReportCategory(category)) {
    return NextResponse.json({ error: "請選擇類別" }, { status: 400 });
  }
  if (reason.length < ISSUE_REPORT_REASON_MIN) {
    return NextResponse.json(
      { error: `請至少輸入 ${ISSUE_REPORT_REASON_MIN} 個字說明原因` },
      { status: 400 },
    );
  }
  if (reason.length > ISSUE_REPORT_REASON_MAX) {
    return NextResponse.json(
      { error: `說明過長（最多 ${ISSUE_REPORT_REASON_MAX} 字）` },
      { status: 400 },
    );
  }

  const recipients = await listSuperAdminRecipientEmails();
  if (recipients.length === 0) {
    console.error("[issue-report] no super admin recipients configured");
    return NextResponse.json(
      { error: "暫時無法送出，請稍後再試" },
      { status: 503 },
    );
  }

  const categoryLabel = issueReportCategoryLabel(category);
  const submittedAt = new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
  });
  const reporterEmail = session.email?.trim().toLowerCase() ?? null;

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("issue_reports").insert({
    organization_id: org.id,
    category,
    reason,
    reporter_email: reporterEmail,
    page_url: pageUrl || null,
  });
  if (insertError) {
    console.error("[issue-report] db insert failed", insertError);
    return NextResponse.json(
      { error: "暫時無法送出，請稍後再試" },
      { status: 503 },
    );
  }

  const sent = await sendEmail({
    to: recipients,
    subject: `[BookSnap] 問題回報：${categoryLabel} — ${org.name}`,
    replyTo: reporterEmail ?? undefined,
    html: buildIssueReportEmailHtml({
      categoryLabel,
      reason,
      orgName: org.name,
      orgId: org.id,
      reporterEmail,
      pageUrl: pageUrl || null,
      submittedAt,
    }),
  });

  if (!sent.ok) {
    console.error("[issue-report] send failed", {
      code: sent.code,
      status: sent.status,
      detail: sent.detail,
      orgId: org.id,
      reporterEmail,
      recipientCount: recipients.length,
    });
    // 不把 Resend 的原始 detail 回給 client（避免「You can only send testing
    // emails to your own email address…」這種訊息漏到 toast）；要除錯就翻
    // Vercel logs 的 `[mail] Resend failed`。
    return NextResponse.json(
      { error: sent.error, code: sent.code },
      { status: sent.code === "rate_limited" ? 429 : 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
