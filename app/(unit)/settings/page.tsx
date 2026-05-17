"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import BottomSheet from "@/components/BottomSheet";
import { signOutAction } from "@/app/auth/actions";
import SignOutButton from "@/components/SignOutButton";
import { deleteAccountAction } from "@/app/(unit)/settings/actions";
import { useToast } from "@/components/ToastProvider";
import { PLAN_META, type OrgPlan } from "@/lib/plans";

type UsageInfo = {
  ai: { used: number; limit: number };
  books: { count: number; limit: number };
} | null;

type MeInfo = {
  plan: OrgPlan | null;
  usage: UsageInfo;
  orgName: string | null;
};

/**
 * Settings hub — single entry point for everything that isn't day-to-day book
 * management. Shows current usage at the top, then a Cursor-style menu list
 * linking out to individual settings pages (單位資料 / 訂閱管理). The 登出
 * button sits in the topbar's right-hand slot.
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
          usage?: UsageInfo;
          orgName?: string | null;
        };
        if (!alive) return;
        setInfo({
          plan: data.plan ?? null,
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
    <AdminShell topbarTitle="設定" topbarRight={<LogoutButton />}>
      {info === null ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6 max-w-2xl mx-auto">
          <UsageCard usage={info.usage} />
          <MenuList plan={info.plan} />
          <DeleteAccountSection orgName={info.orgName} />
        </div>
      )}
    </AdminShell>
  );
}

function UsageCard({ usage }: { usage: UsageInfo }) {
  if (!usage) return null;
  return (
    <section className="rounded-2xl p-3 mb-12">
      <h2 className="text-base font-semibold text-neutral-900">方案用量</h2>
      <p className="mt-1 text-xs text-neutral-500">
        當期方案的智能辨識次數與館藏使用狀況。
      </p>
      <div className="mt-5 space-y-4">
        <UsageRow
          label="智能辨識"
          used={usage.ai.used}
          limit={usage.ai.limit}
          unit="次"
        />
        <UsageRow
          label="館藏"
          used={usage.books.count}
          limit={usage.books.limit}
          unit="冊"
        />
      </div>
    </section>
  );
}

function UsageRow({
  label,
  used,
  limit,
  unit,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const overshooting = used >= limit;
  const nearing = used / Math.max(1, limit) >= 0.8;
  const barClass = overshooting
    ? "bg-red-500"
    : nearing
      ? "bg-amber-500"
      : "bg-neutral-900";
  const numberClass = overshooting
    ? "text-red-600"
    : nearing
      ? "text-amber-700"
      : "text-neutral-700";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-neutral-700">{label}</span>
        <span className={`tabular-nums ${numberClass}`}>
          {used.toLocaleString()} / {limit.toLocaleString()} {unit}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MenuList({ plan }: { plan: OrgPlan | null }) {
  const meta = plan ? PLAN_META[plan] : null;
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
        hint="升級／降級方案、查看帳單記錄"
        right={
          meta ? (
            <span
              className={`inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium ${meta.pillClass}`}
            >
              {meta.label}
            </span>
          ) : null
        }
      />
    </section>
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

function LogoutButton() {
  return (
    <SignOutButton
      action={signOutAction}
      className="inline-flex items-center h-9 px-3 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10 disabled:opacity-60"
    />
  );
}
