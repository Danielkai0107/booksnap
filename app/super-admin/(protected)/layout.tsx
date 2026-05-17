import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { superAdminSignOut } from "../actions";

export default async function SuperAdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-20 bg-white border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-5 md:px-10 h-14 flex items-center justify-between gap-3">
          <Link
            href="/super-admin"
            className="text-base font-semibold tracking-tight text-neutral-900"
          >
            booksnap · 營運後台
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/super-admin"
              className="px-3 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-100 transition"
            >
              總覽
            </Link>
            <Link
              href="/super-admin/organizations"
              className="px-3 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-100 transition"
            >
              單位管理
            </Link>
            <Link
              href="/super-admin/subscriptions"
              className="px-3 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-100 transition"
            >
              訂閱
            </Link>
            <Link
              href="/super-admin/plans"
              className="px-3 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-100 transition"
            >
              方案設定
            </Link>
            <Link
              href="/super-admin/settings"
              className="px-3 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-100 transition"
            >
              設定
            </Link>
            <Link
              href="/super-admin/security"
              className="px-3 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-100 transition"
            >
              資安
            </Link>
            <form action={superAdminSignOut}>
              <button
                type="submit"
                className="ml-1 px-3 py-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 transition"
              >
                登出
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 md:px-10 py-10">{children}</main>
    </div>
  );
}
