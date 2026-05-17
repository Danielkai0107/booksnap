"use client";

import { useEffect, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { superAdminSignOut } from "@/app/super-admin/actions";
import SignOutButton, { signOutOutlineClass } from "@/components/SignOutButton";

type IconProps = SVGProps<SVGSVGElement>;
type NavItem = {
  href: string;
  label: string;
  matchExact: boolean;
  Icon: ComponentType<IconProps>;
};

const mainItems: readonly NavItem[] = [
  {
    href: "/super-admin",
    label: "總覽",
    matchExact: true,
    Icon: LayoutIcon,
  },
  {
    href: "/super-admin/organizations",
    label: "單位管理",
    matchExact: false,
    Icon: BuildingIcon,
  },
  {
    href: "/super-admin/subscriptions",
    label: "訂閱",
    matchExact: false,
    Icon: CreditCardIcon,
  },
  {
    href: "/super-admin/plans",
    label: "方案設定",
    matchExact: false,
    Icon: SlidersIcon,
  },
];

const settingsItem: NavItem = {
  href: "/super-admin/settings",
  label: "設定",
  matchExact: false,
  Icon: SettingsIcon,
};

function navLinkClass(active: boolean) {
  return `flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-sm transition mb-5 ${
    active
      ? "bg-neutral-900 text-white"
      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
  }`;
}

function BrandHeader({
  onClick,
  className = "",
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div className={`mb-6 border-b border-neutral-100 pb-4 ${className}`}>
      <Link
        href="/super-admin"
        onClick={onClick}
        className="block min-w-0 leading-tight hover:opacity-90 transition"
      >
        <span className="block text-xl font-semibold tracking-tight text-neutral-900">
          booksnap
        </span>
        <span className="mt-1.5 block text-sm text-neutral-600 truncate">
          營運後台
        </span>
      </Link>
      <span className="mt-2.5 inline-flex items-center h-[22px] px-2 rounded-full border border-neutral-200 bg-neutral-50 text-[11px] font-medium text-neutral-600">
        Super Admin
      </span>
    </div>
  );
}

function NavLinkItem({
  item,
  onItemClick,
}: {
  item: NavItem;
  onItemClick?: () => void;
}) {
  const pathname = usePathname();
  const { href, label, matchExact, Icon } = item;
  const active = matchExact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onItemClick}
      className={navLinkClass(active)}
    >
      <Icon className="shrink-0" width={18} height={18} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function NavLinks({ onItemClick }: { onItemClick?: () => void }) {
  return (
    <>
      {mainItems.map((item) => (
        <NavLinkItem key={item.href} item={item} onItemClick={onItemClick} />
      ))}
      <NavLinkItem item={settingsItem} onItemClick={onItemClick} />
    </>
  );
}

function SignOutNavItem({ onItemClick }: { onItemClick?: () => void }) {
  return (
    <SignOutButton
      action={superAdminSignOut}
      onClick={onItemClick}
      className={signOutOutlineClass}
    >
      <LogOutIcon className="shrink-0" width={18} height={18} aria-hidden />
      <span className="truncate">登出</span>
    </SignOutButton>
  );
}

export default function SuperAdminSidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 fixed inset-y-0 left-0 flex-col border-r border-neutral-100 bg-white px-5 py-5">
      <BrandHeader />
      <nav className="flex-1 flex flex-col min-h-0">
        <div className="space-y-1">
          <NavLinks />
        </div>
        <div className="mt-auto pt-2">
          <SignOutNavItem />
        </div>
      </nav>
    </aside>
  );
}

export function SuperAdminMobileMenu({
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
        <nav className="flex-1 flex flex-col min-h-0">
          <div className="space-y-1">
            <NavLinks onItemClick={onClose} />
          </div>
          <div className="mt-auto pt-2">
            <SignOutNavItem onItemClick={onClose} />
          </div>
        </nav>
      </aside>
    </div>
  );
}

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

function LayoutIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function BuildingIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}

function CreditCardIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function SlidersIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M2 14h4" />
      <path d="M10 8h4" />
      <path d="M18 16h4" />
    </svg>
  );
}

function SettingsIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function LogOutIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
