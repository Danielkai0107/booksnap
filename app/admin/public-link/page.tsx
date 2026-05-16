"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { useToast } from "@/components/ToastProvider";
import PublicLinkClient from "./PublicLinkClient";
import ShareButton from "./ShareButton";

type Settings = {
  publicSlug: string;
  publicBorrowEnabled: boolean;
  publicCatalogEnabled: boolean;
  orgName: string;
};

/**
 * 「公開連結」管理頁。原本是 server component，會在 render 前透過
 * `requireUnitSession()` + `headers()` 同步取得 session 與請求 host，
 * 讓側欄切換時整個頁面卡住 ~500ms。
 *
 * 改成 client component：
 *  - skeleton 立即顯示，UX 與其他 admin 頁一致
 *  - publicUrl 改用 `window.location.origin`，比之前 server 端的
 *    `x-forwarded-host` 更貼近使用者實際看到的 URL
 *  - 認證錯誤（401）統一導回 /login
 */
export default function PublicLinkPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const next: Settings = {
          publicSlug: data.publicSlug,
          publicBorrowEnabled: !!data.publicBorrowEnabled,
          publicCatalogEnabled: !!data.publicCatalogEnabled,
          orgName: data.basic.name ?? "",
        };
        setSettings(next);
        setPublicUrl(`${window.location.origin}/o/${next.publicSlug}`);
      } catch (err) {
        if (!alive) return;
        console.error("[admin/public-link] fetch failed", err);
        toast.error(err instanceof Error ? err.message : "載入公開連結失敗");
      }
    })();
    return () => {
      alive = false;
    };
  }, [toast]);

  return (
    <AdminShell
      topbarTitle="公開連結"
      topbarRight={
        settings && publicUrl ? (
          <ShareButton
            url={publicUrl}
            title={`${settings.orgName || "booksnap"} · 公開借還`}
            text="從這裡查詢館藏與借歸還"
          />
        ) : null
      }
    >
      {settings === null ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : (
        <PublicLinkClient
          publicUrl={publicUrl}
          publicSlug={settings.publicSlug}
          publicBorrowEnabled={settings.publicBorrowEnabled}
          publicCatalogEnabled={settings.publicCatalogEnabled}
        />
      )}
    </AdminShell>
  );
}
