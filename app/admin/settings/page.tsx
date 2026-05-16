"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { useToast } from "@/components/ToastProvider";
import SettingsClient from "./SettingsClient";

type BasicInfo = {
  name: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
};

/**
 * 「單位資料」入口頁：原本是 server component，但因為 `requireUnitSession()`
 * 一進頁就要跑 3 次 supabase（auth.getUser → profiles → organizations），
 * 讓整個 navigation 卡 ~500ms。改成 client + 背景 fetch /api/admin/settings，
 * AdminShell skeleton 立即顯示，UX 與其他 admin 頁（書籍管理、出借人 ...）對齊。
 */
export default function SettingsPage() {
  const [basic, setBasic] = useState<BasicInfo | null>(null);
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
        setBasic({
          name: data.basic.name ?? "",
          city: data.basic.city ?? "",
          contactEmail: data.basic.contact_email ?? "",
          contactPhone: data.basic.contact_phone ?? "",
        });
      } catch (err) {
        if (!alive) return;
        console.error("[admin/settings] fetch failed", err);
        toast.error(err instanceof Error ? err.message : "載入單位資料失敗");
      }
    })();
    return () => {
      alive = false;
    };
  }, [toast]);

  return (
    <AdminShell topbarTitle="單位資料">
      {basic === null ? (
        <div className="py-20 flex justify-center">
          <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      ) : (
        <SettingsClient basic={basic} />
      )}
    </AdminShell>
  );
}
