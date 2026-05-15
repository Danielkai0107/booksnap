"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "書籍", matchExact: true },
  { href: "/admin/members", label: "成員", matchExact: false },
  { href: "/admin/labels", label: "標籤", matchExact: false },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 shrink-0 fixed inset-y-0 left-0 flex-col border-r border-neutral-100 bg-white px-5 py-7">
      <Link
        href="/"
        className="text-base font-semibold tracking-tight text-neutral-900 mb-10"
      >
        booksnap
      </Link>
      <nav className="flex-1 space-y-1">
        {items.map((item) => {
          const active = item.matchExact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/"
        className="mt-6 text-sm text-neutral-500 hover:text-neutral-900 transition"
      >
        ← 回前台
      </Link>
    </aside>
  );
}
