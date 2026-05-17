"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import BottomSheet from "@/components/BottomSheet";
import { deleteAccountAction } from "@/app/(unit)/settings/actions";
import { useToast } from "@/components/ToastProvider";
import { PLAN_META, type OrgPlan } from "@/lib/plans";
import type { TrialState } from "@/lib/billing/lock";

type UsageInfo = {
  ai: { used: number; periodEnd: string };
  books: { count: number };
} | null;

type MeInfo = {
  plan: OrgPlan | null;
  trialState: TrialState | null;
  trialDaysRemaining: number | null;
  usage: UsageInfo;
  orgName: string | null;
};

/**
 * Settings hub — single entry point for everything that isn't day-to-day book
 * management. Shows current usage at the top, then a Cursor-style menu list
 * linking out to individual settings pages (單位資料 / 訂閱管理). 登出在側邊欄最下方。
 */
export default function SettingsHubPage() {
  const [info, setInfo] = useState<MeInfo | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadMe() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          plan?: OrgPlan | null;
          trialState?: TrialState | null;
          trialDaysRemaining?: number | null;
          usage?: UsageInfo;
          orgName?: string | null;
        };
        if (!alive) return;
        setInfo({
          plan: data.plan ?? null,
          trialState: data.trialState ?? null,
          trialDaysRemaining: data.trialDaysRemaining ?? null,
          usage: data.usage ?? null,
          orgName: data.orgName ?? null,
        });
      } catch (err) {
        console.error("[settings] fetch /api/me failed", err);
      }
    }

    void loadMe();

    const onSessionChange = () => {
      setInfo(null);
      void loadMe();
    };
    window.addEventListener("booksnap:session-changed", onSessionChange);
    return () => {
      alive = false;
      window.removeEventListener("booksnap:session-changed", onSessionChange);
    };
  }, []);

  return (
    <AdminShell topbarTitle="設定">
      {info === null ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6 max-w-2xl mx-auto">
          <UsageCard usage={info.usage} />
          <MenuList
            plan={info.plan}
            trialState={info.trialState}
            trialDaysRemaining={info.trialDaysRemaining}
          />
          <DeleteAccountSection orgName={info.orgName} />
        </div>
      )}
    </AdminShell>
  );
}

function UsageCard({ usage }: { usage: UsageInfo }) {
  if (!usage) return null;
  // 配額移除後，這張卡單純呈現「本月辨識了幾次／館藏總冊數」，沒有上限、沒有警告色。
  const periodEndLabel = (() => {
    try {
      return new Date(usage.ai.periodEnd).toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return null;
    }
  })();
  return (
    <section className="rounded-2xl p-3 mb-12">
      <h2 className="text-base font-semibold text-neutral-900">使用紀錄</h2>
      <p className="mt-1 text-xs text-neutral-500">
        本期的智能辨識次數與目前館藏總冊數，純資訊參考。
      </p>
      <div className="mt-5 space-y-4">
        <UsageRow
          label="智能辨識"
          value={usage.ai.used}
          unit="次"
          hint={periodEndLabel ? `本期至 ${periodEndLabel}` : null}
        />
        <UsageRow
          label="館藏"
          value={usage.books.count}
          unit="冊"
          hint={null}
        />
      </div>
    </section>
  );
}

function UsageRow({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: number;
  unit: string;
  hint: string | null;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-neutral-700">{label}</span>
        <span className="tabular-nums text-neutral-900 font-medium">
          {value.toLocaleString()} {unit}
        </span>
      </div>
      {hint && (
        <p className="mt-1 text-[11px] text-neutral-400">{hint}</p>
      )}
    </div>
  );
}

function MenuList({
  plan,
  trialState,
  trialDaysRemaining,
}: {
  plan: OrgPlan | null;
  trialState: TrialState | null;
  trialDaysRemaining: number | null;
}) {
  return (
    <section className="border border-neutral-200 rounded-2xl overflow-hidden divide-y divide-neutral-100">
      <MenuRow
        href="/settings/profile"
        label="單位資料"
        hint="編輯單位名稱、所在縣市、聯絡資訊"
      />
      <MenuRow
        href="/billing"
        label="訂閱管理"
        hint="查看試用倒數、升級 Pro、帳單記錄"
        right={
          <SubscriptionPill
            plan={plan}
            trialState={trialState}
            trialDaysRemaining={trialDaysRemaining}
          />
        }
      />
    </section>
  );
}

/**
 * 訂閱管理列右側狀態膠囊。優先讀 `trialState` 來決定文案／顏色，因為
 * 直接讀 `plan` 沒辦法區分「試用中」與「試用過期但 plan 還是 trial」。
 */
function SubscriptionPill({
  plan,
  trialState,
  trialDaysRemaining,
}: {
  plan: OrgPlan | null;
  trialState: TrialState | null;
  trialDaysRemaining: number | null;
}) {
  let label: string | null = null;
  let pillClass = "bg-neutral-100 text-neutral-700 border-neutral-200";

  if (trialState === "active_trial") {
    label =
      typeof trialDaysRemaining === "number"
        ? `試用剩 ${trialDaysRemaining} 天`
        : "試用中";
    pillClass = PLAN_META.trial.pillClass;
  } else if (trialState === "expired_trial") {
    label = "試用已結束";
    pillClass = "bg-red-50 text-red-700 border-red-100";
  } else if (trialState === "cancelled_in_period") {
    label = "到期取消";
    pillClass = "bg-amber-50 text-amber-700 border-amber-100";
  } else if (trialState === "paid") {
    label = PLAN_META.pro.label;
    pillClass = PLAN_META.pro.pillClass;
  } else if (plan) {
    // 沒拿到 trialState 時退回原本的 plan-only 顯示，避免完全空白
    const meta = PLAN_META[plan];
    label = meta.label;
    pillClass = meta.pillClass;
  }

  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center h-[26px] px-2.5 rounded-full border text-xs font-medium ${pillClass}`}
    >
      {label}
    </span>
  );
}

function MenuRow({
  href,
  label,
  hint,
  right,
}: {
  href: string;
  label: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 transition"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        {hint && (
          <p className="mt-0.5 text-xs text-neutral-500 truncate">{hint}</p>
        )}
      </div>
      {right}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-neutral-400 shrink-0"
        aria-hidden
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

function DeleteAccountSection({ orgName }: { orgName: string | null }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [pending, startTransition] = useTransition();

  const trimmed = confirmName.trim();
  const canSubmit = Boolean(orgName) && trimmed === orgName;

  function closeSheet() {
    setOpen(false);
    setConfirmName("");
  }

  function handleSubmit() {
    if (!orgName || !canSubmit) return;
    startTransition(async () => {
      const res = await deleteAccountAction(trimmed);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      closeSheet();
    });
  }

  return (
    <>
      <section className="border border-neutral-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!orgName}
          className="w-full px-5 py-4 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
        >
          註銷帳號
        </button>
      </section>

      <BottomSheet
        open={open}
        onClose={closeSheet}
        title="註銷帳號？"
        subtitle="此操作無法復原"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={closeSheet}
              disabled={pending}
              className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending || !canSubmit}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium py-3 rounded-lg transition"
            >
              {pending ? "處理中…" : "確認註銷"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-neutral-600">將永久刪除：</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-600">
          <li>館藏與借還紀錄</li>
          <li>分類與出借人資料</li>
          <li>單位設定與訂閱</li>
          <li>您的登入帳號</li>
        </ul>
        <label className="mt-5 block text-xs font-medium text-neutral-500">
          請輸入單位名稱以確認
        </label>
        <input
          type="text"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={orgName ?? ""}
          autoComplete="off"
          className="mt-1.5 w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </BottomSheet>
    </>
  );
}

