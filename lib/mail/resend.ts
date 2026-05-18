import { escapeHtml } from "./html";

export type SendEmailInput = {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

/**
 * Sends transactional mail via [Resend](https://resend.com) HTTP API.
 *
 * Required env (server-only):
 *  - `RESEND_API_KEY`
 *  - `RESEND_FROM` — e.g. `BookSnap <noreply@booksnaplib.com>`
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    const missing = [
      !apiKey && "RESEND_API_KEY",
      !from && "RESEND_FROM",
    ].filter(Boolean);
    console.error("[mail] missing env:", missing.join(", "));
    return { ok: false, error: "郵件服務尚未設定" };
  }

  const to = [...new Set(input.to.map((e) => e.trim().toLowerCase()))].filter(
    Boolean,
  );
  if (to.length === 0) {
    return { ok: false, error: "找不到收件人" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ?? "";
    } catch {
      /* ignore */
    }
    console.error("[mail] Resend failed", res.status, detail);
    return { ok: false, error: "寄信失敗，請稍後再試" };
  }

  let id: string | undefined;
  try {
    const body = (await res.json()) as { id?: string };
    id = body.id;
  } catch {
    /* ignore */
  }
  return { ok: true, id };
}

export function buildIssueReportEmailHtml(fields: {
  categoryLabel: string;
  reason: string;
  orgName: string;
  orgId: string;
  reporterEmail: string | null;
  pageUrl: string | null;
  submittedAt: string;
}): string {
  const rows = [
    ["類別", fields.categoryLabel],
    ["單位", fields.orgName],
    ["單位 ID", fields.orgId],
    ["回報人", fields.reporterEmail ?? "—"],
    ["頁面", fields.pageUrl ?? "—"],
    ["時間", fields.submittedAt],
  ] as const;

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#737373;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0;color:#171717">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<body style="margin:0;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans TC',sans-serif;background:#f5f5f5;color:#171717">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px">
    <p style="margin:0 0 8px;font-size:18px;font-weight:600">booksnap 問題回報</p>
    <p style="margin:0 0 20px;font-size:13px;color:#737373">單位後台使用者送出的回報</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">${tableRows}</table>
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#525252">原因說明</p>
    <pre style="margin:0;padding:12px;background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;font-family:inherit">${escapeHtml(fields.reason)}</pre>
  </div>
</body>
</html>`;
}
