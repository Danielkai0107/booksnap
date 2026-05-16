import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicOrg } from "@/lib/publicOrg";
import MyRecordsButton from "./MyRecordsButton";

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * Public landing page for a single organization. Three entry points:
 *  - Borrow (phone-gated; collects display_name + email on first contact)
 *  - Return (no identity needed; the QR carries org+book scope)
 *  - Catalog (only when the org left `public_catalog_enabled` on)
 */
export default async function OrgLandingPage({ params }: Props) {
  const { slug } = await params;
  const org = await getPublicOrg(slug);
  if (!org) notFound();

  const borrowDisabled = !org.public_borrow_enabled;

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900">
          {org.name}
        </h1>
        <p className="mt-3 text-center text-sm text-neutral-500">
          掃描書本 QR 即可出借 / 歸還
        </p>

        {borrowDisabled && (
          <p className="mt-6 text-center text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            本單位目前已暫停讀者借還，請聯絡單位人員。
          </p>
        )}

        <div className="mt-12 grid grid-cols-2 gap-3">
          <ActionButton
            href={borrowDisabled ? null : `/o/${org.public_slug}/borrow`}
            primary
            label="出借"
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
            }
          />
          <ActionButton
            href={borrowDisabled ? null : `/o/${org.public_slug}/return`}
            label="歸還"
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
              </svg>
            }
          />
        </div>

        <div
          className={`mt-8 ${org.public_catalog_enabled ? "grid grid-cols-2 gap-3" : ""}`}
        >
          <MyRecordsButton
            slug={org.public_slug}
            orgName={org.name}
            catalogEnabled={!!org.public_catalog_enabled}
          />
          {org.public_catalog_enabled && (
            <ActionButton
              href={`/o/${org.public_slug}/books`}
              label="書籍查詢"
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3.5" y1="6" x2="3.51" y2="6" />
                  <line x1="3.5" y1="12" x2="3.51" y2="12" />
                  <line x1="3.5" y1="18" x2="3.51" y2="18" />
                </svg>
              }
            />
          )}
        </div>

        <p className="mt-12 text-center text-xs text-neutral-400 leading-relaxed">
          每次出借會記錄你的手機與姓名以便追蹤書本去向。
        </p>
      </div>
    </div>
  );
}

function ActionButton({
  href,
  label,
  icon,
  primary = false,
  fullWidth = false,
}: {
  href: string | null;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  fullWidth?: boolean;
}) {
  const className = `press-feedback inline-flex ${fullWidth ? "w-full" : ""} items-center justify-center gap-2 px-4 py-4 rounded-2xl text-sm font-medium transition ${
    primary
      ? "bg-neutral-900 hover:bg-neutral-800 text-white"
      : "bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900"
  } ${href === null ? "opacity-50 cursor-not-allowed" : ""}`;
  if (href === null) {
    return (
      <span className={className} aria-disabled>
        {icon}
        <span className="leading-none">{label}</span>
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {icon}
      <span className="leading-none">{label}</span>
    </Link>
  );
}
