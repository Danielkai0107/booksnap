import Link from "next/link";

type TabKey = "overview" | "books" | "borrowers" | "reports";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "概覽" },
  { key: "books", label: "館藏／入庫" },
  { key: "borrowers", label: "出借人" },
  { key: "reports", label: "問題回報" },
];

export default function OrgDetailTabs({
  baseHref,
  active,
}: {
  baseHref: string;
  active: TabKey;
}) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto">
      {TABS.map((t) => {
        const isActive = active === t.key;
        const href = t.key === "overview" ? baseHref : `${baseHref}?tab=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              isActive
                ? "text-neutral-900 border-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 border-transparent"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export type { TabKey };
