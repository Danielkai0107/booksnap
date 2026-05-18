"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import {
  ISSUE_REPORT_NOTE_MAX,
  ISSUE_REPORT_REPLY_MAX,
  ISSUE_REPORT_STATUSES,
  issueReportStatusMeta,
} from "@/lib/issue-report";
import type { IssueReportStatusValue } from "@/lib/issue-report";
import {
  replyToIssueReport,
  updateIssueReportNote,
  updateIssueReportStatus,
} from "../actions";

type Props = {
  reportId: string;
  initialStatus: IssueReportStatusValue;
  initialNote: string;
  reporterEmail: string | null;
};

export default function IssueReportActions({
  reportId,
  initialStatus,
  initialNote,
  reporterEmail,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<IssueReportStatusValue>(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [savedNote, setSavedNote] = useState(initialNote);
  const [reply, setReply] = useState("");
  const [pending, startTransition] = useTransition();

  const noteDirty = note.trim() !== savedNote.trim();
  const replyValid = reply.trim().length > 0;

  function changeStatus(next: IssueReportStatusValue) {
    if (next === status) return;
    startTransition(async () => {
      const res = await updateIssueReportStatus(reportId, next);
      if (res.ok) {
        setStatus(next);
        toast.success(`已設為「${issueReportStatusMeta(next).label}」`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function saveNote() {
    if (!noteDirty) return;
    startTransition(async () => {
      const res = await updateIssueReportNote(reportId, note);
      if (res.ok) {
        setSavedNote(note);
        toast.success("備註已儲存");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function submitReply() {
    if (!replyValid) return;
    startTransition(async () => {
      const res = await replyToIssueReport(reportId, reply);
      if (res.ok) {
        setReply("");
        if (reporterEmail) {
          toast.success(
            res.emailSent
              ? `已回覆並寄信給 ${reporterEmail}`
              : "已存入回覆紀錄，但寄信失敗，請至 Vercel log 確認",
          );
        } else {
          toast.success("已存入回覆紀錄（此回報無 email，未寄信）");
        }
        if (status === "open") setStatus("in_progress");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-neutral-200 rounded-2xl p-5 md:p-6">
        <h2 className="text-sm font-medium text-neutral-900">處理狀態</h2>
        <p className="mt-1 text-xs text-neutral-500">
          選擇此筆回報目前的狀態，切到「已處理」會記錄處理時間與處理者。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ISSUE_REPORT_STATUSES.map((s) => {
            const active = status === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => changeStatus(s.value)}
                disabled={pending}
                className={`inline-flex items-center h-9 px-4 rounded-full text-sm font-medium border transition press-feedback disabled:opacity-50 ${
                  active
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-medium text-neutral-900">內部備註</h2>
            <p className="mt-1 text-xs text-neutral-500">
              只在後台看得到，不會寄給單位。例如：「已電話聯繫，等對方回覆」。
            </p>
          </div>
          <span className="text-xs text-neutral-400 tabular-nums">
            {note.length} / {ISSUE_REPORT_NOTE_MAX}
          </span>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={ISSUE_REPORT_NOTE_MAX}
          placeholder="（可留空）"
          className="mt-4 w-full px-3 py-2.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 transition resize-y"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setNote(savedNote)}
            disabled={pending || !noteDirty}
            className="bg-white border border-neutral-200 hover:border-neutral-400 disabled:opacity-40 text-neutral-700 text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            還原
          </button>
          <button
            type="button"
            onClick={saveNote}
            disabled={pending || !noteDirty}
            className="bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition press-feedback"
          >
            {pending ? "儲存中…" : "儲存備註"}
          </button>
        </div>
      </section>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-medium text-neutral-900">回覆單位</h2>
            <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
              {reporterEmail ? (
                <>
                  送出後會用 Resend 寄信至{" "}
                  <span className="font-mono text-neutral-700">
                    {reporterEmail}
                  </span>
                  ，並把回覆內容存進歷史紀錄。
                </>
              ) : (
                <>
                  此回報沒有留 email，只會存進歷史紀錄、
                  <span className="text-amber-700">不會寄信</span>。
                </>
              )}
            </p>
          </div>
          <span className="text-xs text-neutral-400 tabular-nums">
            {reply.length} / {ISSUE_REPORT_REPLY_MAX}
          </span>
        </div>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={6}
          maxLength={ISSUE_REPORT_REPLY_MAX}
          placeholder="輸入要回覆給單位的內容…"
          className="mt-4 w-full px-3 py-2.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 transition resize-y"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={submitReply}
            disabled={pending || !replyValid}
            className="bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition press-feedback"
          >
            {pending ? "送出中…" : reporterEmail ? "回覆並寄信" : "存入回覆紀錄"}
          </button>
        </div>
      </section>
    </div>
  );
}
