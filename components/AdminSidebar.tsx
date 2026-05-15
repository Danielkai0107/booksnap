"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";

const items = [
  { href: "/admin", label: "書籍", matchExact: true },
  { href: "/admin/members", label: "成員", matchExact: false },
  { href: "/admin/labels", label: "標籤", matchExact: false },
];

const bottomItemClass =
  "block w-full text-left px-3 py-2.5 rounded-lg text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 transition";

let cachedOrgName: string | null | undefined = undefined;

function useOrgName() {
  const [orgName, setOrgName] = useState<string | null>(
    typeof cachedOrgName === "string" ? cachedOrgName : null
  );

  useEffect(() => {
    if (cachedOrgName !== undefined) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { orgName?: string | null };
        if (!alive) return;
        cachedOrgName = data.orgName ?? null;
        setOrgName(cachedOrgName);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return orgName;
}

function BrandHeader({ onClick }: { onClick?: () => void }) {
  const orgName = useOrgName();
  return (
    <Link
      href="/"
      onClick={onClick}
      className="block mb-10 leading-tight hover:opacity-90 transition"
    >
      <span className="block text-base font-semibold tracking-tight text-neutral-900">
        booksnap
      </span>
      <span className="block mt-1 text-xs text-neutral-500 truncate">
        {orgName ?? "—"}
      </span>
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
    <aside className="hidden md:flex w-60 shrink-0 fixed inset-y-0 left-0 flex-col border-r border-neutral-100 bg-white px-5 py-7">
      <BrandHeader />
      <nav className="flex-1 space-y-1">
        <NavLinks />
      </nav>
      <div className="mt-6 space-y-3">
        <Link href="/" className={bottomItemClass}>
          回前台
        </Link>
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
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <BrandHeader onClick={onClose} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉選單"
            className="w-8 h-8 -mt-1 shrink-0 rounded-full hover:bg-neutral-100 flex items-center justify-center transition text-neutral-700"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path
                d="M1 1L13 13M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-1">
          <NavLinks onItemClick={onClose} />
        </nav>
        <div className="mt-6 space-y-3">
          <Link href="/" onClick={onClose} className={bottomItemClass}>
            回前台
          </Link>
          <SignOutButton onClick={onClose} />
        </div>
      </aside>
    </div>
  );
}
