"use client";

import AdminShell from "@/components/AdminShell";
import MfaSettings from "@/components/MfaSettings";

export default function SecuritySettingsPage() {
  return (
    <AdminShell topbarTitle="資安設定" backHref="/settings">
      <div className="space-y-6">
        <header>
          <h1 className="text-base font-semibold text-neutral-900">
            雙重驗證
          </h1>
          <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
            為您的登入額外加上一層保護，避免單靠密碼洩漏即被入侵。
          </p>
        </header>

        <MfaSettings />
      </div>
    </AdminShell>
  );
}
