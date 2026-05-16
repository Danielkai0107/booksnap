"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import {
  PLAN_META,
  PLAN_ORDER,
  PLAN_PRICE,
  PLAN_QUOTAS,
  type OrgPlan,
} from "@/lib/plans";

const items = [
  { href: "/admin", label: "書籍管理", matchExact: true },
  { href: "/admin/borrowers", label: "出借人", matchExact: false },
  { href: "/admin/categories", label: "分類管理", matchExact: false },
  { href: "/admin/labels", label: "標籤列印", matchExact: false },
  { href: "/admin/settings", label: "單位資料", matchExact: false },
  { href: "/admin/public-link", label: "借還 QR／連結", matchExact: false },
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
  const [planOpen, setPlanOpen] = useState(false);
  return (
    <div className={`mb-6 border-b border-neutral-100 pb-4 ${className}`}>
      <Link
        href="/admin"
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
              <button
                type="button"
                onClick={() => setPlanOpen(true)}
                className="inline-flex items-center h-[22px] px-2.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-[11px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10"
              >
                升級
              </button>
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
      {planOpen && (
        <PlanInfoModal
          currentPlan={plan}
          usage={usage}
          onClose={() => setPlanOpen(false)}
        />
      )}
    </div>
  );
}

function PlanInfoModal({
  currentPlan,
  usage,
  onClose,
}: {
  currentPlan: OrgPlan | null;
  usage: UsageInfo;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<OrgPlan>(currentPlan ?? "free");

  useEffect(() => {
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
  }, [onClose]);

  // Safe because the modal is only rendered after a user click in a
  // "use client" component, so we're always past hydration here.
  if (typeof document === "undefined") return null;

  const isSameAsCurrent = selected === currentPlan;
  const selectedIdx = PLAN_ORDER.indexOf(selected);
  const currentIdx = currentPlan ? PLAN_ORDER.indexOf(currentPlan) : -1;
  const direction =
    !currentPlan || selectedIdx > currentIdx
      ? "upgrade"
      : selectedIdx < currentIdx
        ? "downgrade"
        : "same";
  const ctaText = isSameAsCurrent
    ? `目前是 ${PLAN_META[selected].label} 方案`
    : `${direction === "upgrade" ? "升級到" : "切換到"} ${PLAN_META[selected].label} · ${PLAN_PRICE[selected].label}`;

  const content = (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:px-4">
      <button
        type="button"
        aria-label="關閉方案說明"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/40"
      />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-neutral-200 shadow-xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition"
        >
          <CloseIcon />
        </button>
        <h3 className="text-base font-semibold text-neutral-900 pr-10">
          選擇方案
        </h3>
        <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
          智能辨識每月依單位啟用日重置；館藏冊數為累計上限。
        </p>

        {usage && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-neutral-50 border border-neutral-100">
            <p className="text-xs text-neutral-500">本期目前用量</p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-neutral-600">智能辨識</span>
                <span className="tabular-nums text-neutral-900">
                  {usage.ai.used.toLocaleString()} /{" "}
                  {usage.ai.limit.toLocaleString()} 次
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-neutral-600">館藏</span>
                <span className="tabular-nums text-neutral-900">
                  {usage.books.count.toLocaleString()} /{" "}
                  {usage.books.limit.toLocaleString()} 冊
                </span>
              </div>
            </div>
          </div>
        )}

        <ul className="mt-5 space-y-2.5">
          {PLAN_ORDER.map((p) => {
            const meta = PLAN_META[p];
            const quotas = PLAN_QUOTAS[p];
            const price = PLAN_PRICE[p];
            const isCurrent = currentPlan === p;
            const isSelected = selected === p;
            return (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => setSelected(p)}
                  aria-pressed={isSelected}
                  className={`w-full text-left rounded-xl border-2 px-4 py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10 ${
                    isSelected
                      ? "border-neutral-900 bg-neutral-50"
                      : "border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium ${meta.pillClass}`}
                      >
                        {meta.label}
                      </span>
                      {isCurrent && (
                        <span className="text-[11px] text-neutral-500">
                          目前方案
                        </span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-neutral-800 font-medium">
                      {price.label}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs text-neutral-500">智能辨識</span>
                      <span className="tabular-nums text-neutral-800">
                        {quotas.ai.toLocaleString()} 次／月
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs text-neutral-500">館藏冊數</span>
                      <span className="tabular-nums text-neutral-800">
                        {quotas.books.toLocaleString()} 冊
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onClose}
          disabled={isSameAsCurrent}
          className="mt-5 w-full bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-500 text-white text-sm font-medium px-4 py-3 rounded-xl transition"
        >
          {ctaText}
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
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

/** 共用的 ✕ 圖示，給 sidebar / 手機 drawer 的 absolute 關閉按鈕用 */
function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 1L13 13M13 1L1 13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
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
          <SignOutButton onClick={onClose} />
        </div>
      </aside>
    </div>
  );
}
