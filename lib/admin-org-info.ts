"use client";

import { useEffect, useState } from "react";
import type { OrgPlan } from "@/lib/plans";

export type AdminOrgInfo = {
  orgName: string | null;
  publicSlug: string | null;
  plan: OrgPlan | null;
};

const EMPTY: AdminOrgInfo = {
  orgName: null,
  publicSlug: null,
  plan: null,
};

let cached: AdminOrgInfo | undefined;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function parseMe(data: Record<string, unknown>): AdminOrgInfo {
  return {
    orgName: (data.orgName as string | null | undefined) ?? null,
    publicSlug: (data.publicSlug as string | null | undefined) ?? null,
    plan: (data.plan as OrgPlan | null | undefined) ?? null,
  };
}

async function loadFromApi(): Promise<AdminOrgInfo> {
  const res = await fetch("/api/me", { cache: "no-store" });
  if (!res.ok) return EMPTY;
  const data = (await res.json()) as Record<string, unknown>;
  return parseMe(data);
}

/** 登出或切換帳號時清掉，避免側邊欄顯示上一個單位的名稱／方案 */
export function clearAdminOrgInfoCache(): void {
  cached = undefined;
  notify();
}

/** 首次載入（多個側邊欄元件共用同一份快取） */
export async function fetchAdminOrgInfo(): Promise<AdminOrgInfo> {
  if (cached) return cached;
  cached = await loadFromApi();
  notify();
  return cached;
}

/** 單位資料等變更後強制重抓，並通知所有訂閱者（含側邊欄） */
export async function refreshAdminOrgInfo(): Promise<AdminOrgInfo> {
  cached = await loadFromApi();
  notify();
  return cached;
}

export function useAdminOrgInfo(): AdminOrgInfo {
  const [info, setInfo] = useState<AdminOrgInfo>(cached ?? EMPTY);

  useEffect(() => {
    const onChange = () => setInfo(cached ?? EMPTY);
    listeners.add(onChange);

    if (cached === undefined) {
      void fetchAdminOrgInfo();
    } else {
      setInfo(cached);
    }

    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return info;
}
