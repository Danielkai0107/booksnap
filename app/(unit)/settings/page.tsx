"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import { signOutAction } from "@/app/auth/actions";
import { PLAN_META, type OrgPlan } from "@/lib/plans";

type UsageInfo = {
  ai: { used: number; limit: number };
  books: { count: number; limit: number };
} | null;

type MeInfo = {
  plan: OrgPlan | null;
  usage: UsageInfo;
};

/**
 * Settings hub — single entry point for everything that isn't day-to-day book
 * management. Shows current usage at the top, then a Cursor-style menu list
 * linking out to individual settings pages (單位資料 / 訂閱管理), and a logout
 * action at the bottom.
 */
export default function SettingsHubPage() {
  const [info, setInfo] = useState<MeInfo | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
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
        };
        if (!alive) return;
        setInfo({
          plan: data.plan ?? null,
          usage: data.usage ?? null,
        });
      } catch (err) {
        console.error("[settings] fetch /api/me failed", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AdminShell topbarTitle="設定">
      {info === null ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6 max-w-2xl">
          <UsageCard usage={info.usage} />
          <MenuList plan={info.plan} />
          <LogoutSection />
        </div>
      )}
    </AdminShell>
  );
}

function UsageCard({ usage }: { usage: UsageInfo }) {
  if (!usage) return null;
  return (
    <section className="border border-neutral-200 rounded-2xl p-5 md:p-7">
      <h2 className="text-base font-semibold text-neutral-900">用量</h2>
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

function LogoutSection() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="w-full px-5 py-3 rounded-2xl border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition"
      >
        登出
      </button>
    </form>
  );
}
