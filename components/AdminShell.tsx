"use client";

import { ReactNode } from "react";
import CloseButton from "./CloseButton";
import AdminSidebar from "./AdminSidebar";

type Props = {
  children: ReactNode;
  /** 手機 X 圓鈕的回上頁路徑 */
  backHref?: string;
  /** 桌機內容區頂端的「← 返回」連結（詳情頁用） */
  desktopBack?: { href: string; label: string };
};

export default function AdminShell({
  children,
  backHref = "/",
  desktopBack,
}: Props) {
  return (
    <div className="min-h-screen bg-white">
      <CloseButton href={backHref} hideOnDesktop />
      <AdminSidebar />
      <main className="md:ml-60">
        <div className="max-w-2xl md:max-w-5xl mx-auto px-5 md:px-10 py-8 md:py-10">
          {desktopBack && (
            <div className="hidden md:block mb-6">
              <a
                href={desktopBack.href}
                className="text-sm text-neutral-500 hover:text-neutral-900 transition"
              >
                ← {desktopBack.label}
              </a>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
