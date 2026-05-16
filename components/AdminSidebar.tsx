"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";

const items = [
  { href: "/admin", label: "書籍管理", matchExact: true },
  { href: "/admin/borrowers", label: "出借人", matchExact: false },
  { href: "/admin/categories", label: "分類管理", matchExact: false },
  { href: "/admin/labels", label: "標籤列印", matchExact: false },
  { href: "/admin/settings", label: "單位資料", matchExact: false },
  { href: "/admin/public-link", label: "公開連結", matchExact: false },
];

const bottomItemClass =
  "block w-full text-left px-3 py-2.5 rounded-lg text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 transition";

type CachedMe = { orgName: string | null; publicSlug: string | null };

let cachedMe: CachedMe | undefined = undefined;

function useOrgInfo() {
  const [info, setInfo] = useState<CachedMe>(
    cachedMe ?? { orgName: null, publicSlug: null },
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
        };
        if (!alive) return;
        cachedMe = {
          orgName: data.orgName ?? null,
          publicSlug: data.publicSlug ?? null,
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
  const { orgName } = useOrgInfo();
  return (
    <Link
      href="/admin"
      onClick={onClick}
      className={`block mb-7 leading-tight hover:opacity-90 transition border-b border-neutral-100 pb-4 ${className}`}
    >
      <span className="block text-xl font-semibold tracking-tight text-neutral-900">
        booksnap
      </span>
      <span className="block mt-1.5 text-sm text-neutral-600 truncate">
        {orgName ?? "—"}
      </span>
    </Link>
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
        公開頁待啟用
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
      查看公開頁 ↗
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
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉選單"
          className="absolute top-5 right-5 w-7 h-7 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition"
        >
          <CloseIcon />
        </button>
        <BrandHeader onClick={onClose} className="pr-10" />
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
