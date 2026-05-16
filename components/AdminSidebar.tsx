"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { PLAN_META, type OrgPlan } from "@/lib/plans";

const items = [
  { href: "/", label: "書籍管理", matchExact: true },
  { href: "/borrowers", label: "出借人", matchExact: false },
  { href: "/categories", label: "分類管理", matchExact: false },
  { href: "/labels", label: "標籤列印", matchExact: false },
  { href: "/settings", label: "單位資料", matchExact: false },
  { href: "/public-link", label: "借還 QR／連結", matchExact: false },
];

const bottomItemClass =
  "block w-full text-left px-3 py-2.5 rounded-lg text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 transition";

type UsageInfo = {
  ai: { used: number; limit: number };
  books: { count: number; limit: number };
} | null;

type CachedMe = {
  orgName: string | null;
  publicSlug: string | null;
  plan: OrgPlan | null;
  usage: UsageInfo;
};

let cachedMe: CachedMe | undefined = undefined;

function useOrgInfo() {
  const [info, setInfo] = useState<CachedMe>(
    cachedMe ?? {
      orgName: null,
      publicSlug: null,
      plan: null,
      usage: null,
    },
  );

  useEffect(() => {
    if (cachedMe !== undefined) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          orgName?: string | null;
          publicSlug?: string | null;
          plan?: OrgPlan | null;
          usage?: UsageInfo;
        };
        if (!alive) return;
        cachedMe = {
          orgName: data.orgName ?? null,
          publicSlug: data.publicSlug ?? null,
          plan: data.plan ?? null,
          usage: data.usage ?? null,
        };
        setInfo(cachedMe);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return info;
}

function BrandHeader({
  onClick,
  className = "",
}: {
  onClick?: () => void;
  className?: string;
}) {
  const { orgName, plan, usage } = useOrgInfo();
  const meta = plan ? PLAN_META[plan] : null;
  return (
    <div className={`mb-6 border-b border-neutral-100 pb-4 ${className}`}>
      <Link
        href="/"
        onClick={onClick}
        className="block leading-tight hover:opacity-90 transition"
      >
        <span className="block text-xl font-semibold tracking-tight text-neutral-900">
          booksnap
        </span>
        <span className="mt-1.5 block text-sm text-neutral-600 truncate">
          {orgName ?? "—"}
        </span>
      </Link>
      {(meta || usage) && (
        <div className="mt-5 mb-2">
          {meta && (
            <div className="flex items-center justify-between gap-4">
              <span
                className={`inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium shrink-0 ${meta.pillClass}`}
              >
                {meta.label}
              </span>
              <Link
                href="/billing"
                onClick={onClick}
                className="inline-flex items-center h-[22px] px-2.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-[11px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10"
              >
                升級
              </Link>
            </div>
          )}
          {usage && (
            <div className="mt-4 space-y-2.5">
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
          )}
        </div>
      )}
    </div>
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
    <span className="block">
      <span className="flex items-baseline justify-between text-[11px]">
        <span className="text-neutral-500">{label}</span>
        <span className={`tabular-nums ${numberClass}`}>
          {used.toLocaleString()} / {limit.toLocaleString()} {unit}
        </span>
      </span>
      <span className="mt-2 block h-1 rounded-full bg-neutral-100 overflow-hidden">
        <span
          className={`block h-full rounded-full ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

function BillingLinkButton({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/billing" onClick={onClick} className={bottomItemClass}>
      訂閱設定
    </Link>
  );
}

function PublicLinkButton({ onClick }: { onClick?: () => void }) {
  const { publicSlug } = useOrgInfo();
  if (!publicSlug) {
    return (
      <span className={`${bottomItemClass} opacity-60 cursor-not-allowed`}>
        借還頁尚未設定
      </span>
    );
  }
  return (
    <Link
      href={`/o/${publicSlug}`}
      onClick={onClick}
      target="_blank"
      rel="noopener"
      className={bottomItemClass}
    >
      看看讀者畫面
    </Link>
  );
}

function SignOutButton({ onClick }: { onClick?: () => void }) {
  return (
    <form action={signOutAction}>
      <button type="submit" onClick={onClick} className={bottomItemClass}>
        登出
      </button>
    </form>
  );
}

function NavLinks({ onItemClick }: { onItemClick?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.matchExact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            className={`block px-3 py-2.5 rounded-lg text-sm transition ${
              active
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export default function AdminSidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 fixed inset-y-0 left-0 flex-col border-r border-neutral-100 bg-white px-5 py-5">
      <BrandHeader />
      <nav className="flex-1 space-y-1">
        <NavLinks />
      </nav>
      <div className="mt-6 space-y-3">
        <PublicLinkButton />
        <BillingLinkButton />
        <SignOutButton />
      </div>
    </aside>
  );
}

export function AdminMobileMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-2xl flex flex-col px-5 py-7 animate-slide-right">
        <BrandHeader onClick={onClose} />
        <nav className="flex-1 space-y-1">
          <NavLinks onItemClick={onClose} />
        </nav>
        <div className="mt-6 space-y-3">
          <PublicLinkButton onClick={onClose} />
          <BillingLinkButton onClick={onClose} />
          <SignOutButton onClick={onClose} />
        </div>
      </aside>
    </div>
  );
}
