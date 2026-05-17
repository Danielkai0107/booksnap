"use client";

import { useEffect, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminOrgInfo } from "@/lib/admin-org-info";
import { PLAN_META } from "@/lib/plans";

type IconProps = SVGProps<SVGSVGElement>;
type NavItem = {
  href: string;
  label: string;
  matchExact: boolean;
  Icon: ComponentType<IconProps>;
};

const items: readonly NavItem[] = [
  { href: "/", label: "書籍管理", matchExact: true, Icon: BookIcon },
  { href: "/borrowers", label: "出借人", matchExact: false, Icon: UsersIcon },
  {
    href: "/categories",
    label: "分類管理",
    matchExact: false,
    Icon: TagIcon,
  },
  { href: "/labels", label: "標籤列印", matchExact: false, Icon: PrinterIcon },
  {
    href: "/public-link",
    label: "我的借閱連結",
    matchExact: false,
    Icon: LinkIcon,
  },
];

const bottomItemClass =
  "flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 transition";

function BrandHeader({
  onClick,
  className = "",
}: {
  onClick?: () => void;
  className?: string;
}) {
  const { orgName, plan } = useAdminOrgInfo();
  const meta = plan ? PLAN_META[plan] : null;
  // pro 已是頂層方案，不再顯示升級按鈕。
  const showUpgrade = plan !== null && plan !== "pro";
  return (
    <div className={`mb-6 border-b border-neutral-100 pb-4 ${className}`}>
      <Link
        href="/"
        onClick={onClick}
        className="block min-w-0 leading-tight hover:opacity-90 transition"
      >
        <span className="block text-xl font-semibold tracking-tight text-neutral-900">
          booksnap
        </span>
        <span className="mt-1.5 block text-sm text-neutral-600 truncate">
          {orgName ?? "—"}
        </span>
      </Link>
      {(meta || showUpgrade) && (
        <div className="mt-2.5 flex items-center gap-2">
          {meta && (
            <span
              className={`inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-medium ${meta.pillClass}`}
            >
              {meta.label}
            </span>
          )}
          {showUpgrade && (
            <Link
              href="/billing"
              onClick={onClick}
              className="ml-auto inline-flex items-center h-[22px] px-2.5 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-[11px] font-medium transition"
            >
              升級
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function PublicLinkButton({ onClick }: { onClick?: () => void }) {
  const { publicSlug } = useAdminOrgInfo();
  if (!publicSlug) {
    return (
      <span className={`${bottomItemClass} opacity-60 cursor-not-allowed`}>
        <EyeIcon className="shrink-0" width={18} height={18} aria-hidden />
        <span className="truncate">借還頁尚未設定</span>
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
      <EyeIcon className="shrink-0" width={18} height={18} aria-hidden />
      <span className="truncate">我的借閱入口</span>
    </Link>
  );
}

function SettingsLink({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/settings" onClick={onClick} className={bottomItemClass}>
      <SettingsIcon className="shrink-0" width={18} height={18} aria-hidden />
      <span className="truncate">設定</span>
    </Link>
  );
}

function NavLinks({ onItemClick }: { onItemClick?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {items.map(({ href, label, matchExact, Icon }) => {
        const active = matchExact
          ? pathname === href
          : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onItemClick}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition ${
              active
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            }`}
          >
            <Icon className="shrink-0" width={18} height={18} aria-hidden />
            <span className="truncate">{label}</span>
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
      <div className="mt-6 space-y-2">
        <PublicLinkButton />
        <SettingsLink />
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
        <div className="mt-6 space-y-2">
          <PublicLinkButton onClick={onClose} />
          <SettingsLink onClick={onClose} />
        </div>
      </aside>
    </div>
  );
}

// ─── icons (Lucide-style 24x24 strokes) ────────────────────────────────────

function svgProps(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    width: 20,
    height: 20,
    ...props,
  };
}

function BookIcon(props: IconProps) {
  // lucide `book-open`
  return (
    <svg {...svgProps(props)}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function UsersIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TagIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10z" />
      <circle cx="7" cy="7" r="1.2" />
    </svg>
  );
}

function PrinterIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function LinkIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function EyeIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SettingsIcon(props: IconProps) {
  // lucide `bolt`
  return (
    <svg {...svgProps(props)}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
