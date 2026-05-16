"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "書籍管理", matchExact: true },
  { href: "/borrowers", label: "出借人", matchExact: false },
  { href: "/categories", label: "分類管理", matchExact: false },
  { href: "/labels", label: "標籤列印", matchExact: false },
  { href: "/public-link", label: "借還 QR／連結", matchExact: false },
];

const bottomItemClass =
  "block w-full text-left px-3 py-2.5 rounded-lg text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 transition";

type CachedMe = {
  orgName: string | null;
  publicSlug: string | null;
};

let cachedMe: CachedMe | undefined = undefined;

function useOrgInfo() {
  const [info, setInfo] = useState<CachedMe>(
    cachedMe ?? {
      orgName: null,
      publicSlug: null,
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
    <div className={`mb-6 border-b border-neutral-100 pb-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          onClick={onClick}
          className="block flex-1 min-w-0 leading-tight hover:opacity-90 transition"
        >
          <span className="block text-xl font-semibold tracking-tight text-neutral-900">
            booksnap
          </span>
          <span className="mt-1.5 block text-sm text-neutral-600 truncate">
            {orgName ?? "—"}
          </span>
        </Link>
        <Link
          href="/settings"
          onClick={onClick}
          aria-label="設定"
          title="設定"
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10"
        >
          <SettingsIcon />
        </Link>
      </div>
    </div>
  );
}

function SettingsIcon() {
  // Lucide `bolt` icon — https://lucide.dev/icons/bolt
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <circle cx="12" cy="12" r="4" />
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
        </div>
      </aside>
    </div>
  );
}
