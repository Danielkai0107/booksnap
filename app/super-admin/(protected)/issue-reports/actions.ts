"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/billing/apply";
import {
  buildIssueReplyEmailHtml,
  sendEmail,
} from "@/lib/mail/resend";
import {
  ISSUE_REPORT_NOTE_MAX,
  ISSUE_REPORT_REPLY_MAX,
  ISSUE_REPORT_REPLY_MIN,
  isIssueReportStatus,
  issueReportCategoryLabel,
} from "@/lib/issue-report";
import type { IssueReportCategory } from "@/lib/issue-report";
import type {
  IssueReportReplyRow,
  IssueReportRow,
} from "@/lib/supabase/types";

type Result = { ok: true } | { ok: false; error: string };
type ReplyResult =
  | { ok: true; replyId: string; emailSent: boolean }
  | { ok: false; error: string };

async function assertSuperAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const role = data.user?.app_metadata?.role;
  if (role !== "super_admin") {
    throw new Error("forbidden");
  }
  return { userId: data.user!.id };
}

function revalidateAll(reportId: string, orgId: string | null) {
  revalidatePath("/super-admin/issue-reports");
  revalidatePath(`/super-admin/issue-reports/${reportId}`);
  if (orgId) {
    revalidatePath(`/super-admin/organizations/${orgId}`);
  }
}

/** 更新處理狀態。狀態切到 resolved 時記下時間與處理者；切回 open/in_progress 則清空。 */
export async function updateIssueReportStatus(
  reportId: string,
  nextStatus: string,
): Promise<Result> {
  const { userId } = await assertSuperAdmin();
  if (!isIssueReportStatus(nextStatus)) {
    return { ok: false, error: "未知的狀態" };
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("issue_reports")
    .select("id, organization_id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (!current) {
    return { ok: false, error: "找不到此回報" };
  }
  if (current.status === nextStatus) {
    return { ok: true };
  }

  const updates: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "resolved") {
    updates.resolved_at = new Date().toISOString();
    updates.resolved_by = userId;
  } else {
    updates.resolved_at = null;
    updates.resolved_by = null;
  }

  const { error } = await admin
    .from("issue_reports")
    .update(updates)
    .eq("id", reportId);
  if (error) {
    console.error("[issue-report] update status failed", error);
    return { ok: false, error: "更新失敗，請稍後再試" };
  }

  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "issue_report.status_changed",
    target_org_id: current.organization_id,
    meta: {
      report_id: reportId,
      from: current.status,
      to: nextStatus,
    },
  });

  revalidateAll(reportId, current.organization_id);
  return { ok: true };
}

export async function updateIssueReportNote(
  reportId: string,
  rawNote: string,
): Promise<Result> {
  const { userId } = await assertSuperAdmin();
  const note = rawNote.trim();
  if (note.length > ISSUE_REPORT_NOTE_MAX) {
    return { ok: false, error: `備註過長（最多 ${ISSUE_REPORT_NOTE_MAX} 字）` };
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("issue_reports")
    .select("id, organization_id")
    .eq("id", reportId)
    .maybeSingle();
  if (!current) {
    return { ok: false, error: "找不到此回報" };
  }

  const { error } = await admin
    .from("issue_reports")
    .update({ admin_note: note.length === 0 ? null : note })
    .eq("id", reportId);
  if (error) {
    console.error("[issue-report] update note failed", error);
    return { ok: false, error: "儲存失敗，請稍後再試" };
  }

  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "issue_report.note_updated",
    target_org_id: current.organization_id,
    meta: { report_id: reportId, length: note.length },
  });

  revalidateAll(reportId, current.organization_id);
  return { ok: true };
}

/**
 * 寫一筆回覆並嘗試 Resend 寄信給回報人。
 *
 * - 若 reporter_email 為空：仍會寫入子表（保留內部紀錄），email_status='skipped'。
 * - Resend 失敗：reply 仍會寫入，email_status='failed'，前端會顯示重試提示。
 * - 若回報目前是 open，會順手推進到 in_progress（不覆寫 resolved/in_progress）。
 */
export async function replyToIssueReport(
  reportId: string,
  rawBody: string,
): Promise<ReplyResult> {
  const { userId } = await assertSuperAdmin();
  const body = rawBody.trim();
  if (body.length < ISSUE_REPORT_REPLY_MIN) {
    return { ok: false, error: "請輸入回覆內容" };
  }
  if (body.length > ISSUE_REPORT_REPLY_MAX) {
    return {
      ok: false,
      error: `回覆過長（最多 ${ISSUE_REPORT_REPLY_MAX} 字）`,
    };
  }

  const admin = createAdminClient();
  const { data: reportData } = await admin
    .from("issue_reports")
    .select(
      "id, organization_id, category, reason, reporter_email, status, created_at",
    )
    .eq("id", reportId)
    .maybeSingle();
  if (!reportData) {
    return { ok: false, error: "找不到此回報" };
  }
  const report = reportData as Pick<
    IssueReportRow,
    | "id"
    | "organization_id"
    | "category"
    | "reason"
    | "reporter_email"
    | "status"
    | "created_at"
  >;

  const { data: orgRow } = await admin
    .from("organizations")
    .select("name")
    .eq("id", report.organization_id)
    .maybeSingle();
  const orgName = (orgRow as { name?: string } | null)?.name ?? "您的單位";

  // Step 1: 先把 reply 寫進 DB（pending 狀態），就算後面寄信失敗也保留訊息。
  const { data: insertedRaw, error: insertError } = await admin
    .from("issue_report_replies")
    .insert({
      issue_report_id: report.id,
      admin_id: userId,
      body,
      email_status: report.reporter_email ? "pending" : "skipped",
    })
    .select("*")
    .single();
  if (insertError || !insertedRaw) {
    console.error("[issue-report] insert reply failed", insertError);
    return { ok: false, error: "送出失敗，請稍後再試" };
  }
  const reply = insertedRaw as IssueReportReplyRow;

  // Step 2: 寄信（若有 reporter_email）。
  let emailSent = false;
  if (report.reporter_email) {
    const sent = await sendEmail({
      to: [report.reporter_email],
      subject: `[BookSnap] 回覆您的問題回報：${issueReportCategoryLabel(report.category as IssueReportCategory)}`,
      html: buildIssueReplyEmailHtml({
        orgName,
        categoryLabel: issueReportCategoryLabel(
          report.category as IssueReportCategory,
        ),
        originalReason: report.reason,
        originalSubmittedAt: new Date(report.created_at).toLocaleString(
          "zh-TW",
          { timeZone: "Asia/Taipei" },
        ),
        replyBody: body,
        replyAt: new Date().toLocaleString("zh-TW", {
          timeZone: "Asia/Taipei",
        }),
      }),
    });

    if (sent.ok) {
      emailSent = true;
      await admin
        .from("issue_report_replies")
        .update({
          email_status: "sent",
          resend_id: sent.id ?? null,
          email_error: null,
        })
        .eq("id", reply.id);
    } else {
      console.error("[issue-report] reply email failed", {
        replyId: reply.id,
        code: sent.code,
        detail: sent.detail,
      });
      await admin
        .from("issue_report_replies")
        .update({
          email_status: "failed",
          email_error: sent.detail ?? sent.error,
        })
        .eq("id", reply.id);
    }
  }

  // Step 3: 若還在 open，順手推進到 in_progress（已 resolved 不動）。
  if (report.status === "open") {
    await admin
      .from("issue_reports")
      .update({ status: "in_progress" })
      .eq("id", reportId);
  }

  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "issue_report.replied",
    target_org_id: report.organization_id,
    meta: {
      report_id: reportId,
      reply_id: reply.id,
      email_sent: emailSent,
      had_reporter_email: Boolean(report.reporter_email),
    },
  });

  revalidateAll(reportId, report.organization_id);
  return { ok: true, replyId: reply.id, emailSent };
}
