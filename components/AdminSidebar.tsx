"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BottomSheet from "@/components/BottomSheet";
import { useToast } from "@/components/ToastProvider";
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
    <div className={`relative mb-6 border-b border-neutral-100 pb-4 ${className}`}>
      <PublicLinkIconButton onClick={onClick} />
      <Link
        href="/"
        onClick={onClick}
        className="block min-w-0 pr-11 leading-tight hover:opacity-90 transition"
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

const publicLinkIconClass =
  "absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition";

function PublicLinkIconButton({ onClick }: { onClick?: () => void }) {
  const { publicSlug, orgName } = useAdminOrgInfo();
  const [sheetOpen, setSheetOpen] = useState(false);
  const toast = useToast();

  if (!publicSlug) {
    return (
      <span
        className={`${publicLinkIconClass} opacity-40 cursor-not-allowed`}
        aria-disabled
        title="借還頁尚未設定"
      >
        <BookOpenCheckIcon width={17} height={17} aria-hidden />
      </span>
    );
  }

  async function handleShare() {
    const publicUrl = `${window.location.origin}/o/${publicSlug}`;
    const shareData = {
      url: publicUrl,
      title: `${orgName || "booksnap"} · 借還書`,
      text: "掃描書上 QR 即可借書、還書",
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.warn("[sidebar] native share failed, fallback to copy", err);
      }
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("已複製借還連結");
    } catch (err) {
      console.error("[sidebar] copy failed", err);
      toast.error("分享失敗，請手動複製連結");
    }
  }

  function handleGo() {
    setSheetOpen(false);
    onClick?.();
    window.open(`/o/${publicSlug}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={publicLinkIconClass}
        aria-label="我的借閱入口"
        title="我的借閱入口"
      >
        <BookOpenCheckIcon width={17} height={17} aria-hidden />
      </button>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        compact
        title="準備前往借閱入口"
        subtitle="可以分享給你的使用者"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 min-w-0 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
            >
              分享
            </button>
            <button
              type="button"
              onClick={handleGo}
              className="flex-1 min-w-0 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
            >
              前往
            </button>
          </div>
        }
      />
    </>
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
      <div className="mt-6">
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
        <div className="mt-6">
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

/** lucide `book-open-check` */
function BookOpenCheckIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M12 21V7" />
      <path d="m16 12 2 2 4-4" />
      <path d="M22 6V4a1 1 0 0 0-1-1h-5a4 4 0 0 0-4 4 4 4 0 0 0-4-4H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6a1 1 0 0 0 1-1v-1.3" />
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
