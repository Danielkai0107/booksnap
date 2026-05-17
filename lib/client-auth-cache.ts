import { clearAdminOrgInfoCache } from "@/lib/admin-org-info";

/** 入庫掃描流程的 sessionStorage（與單位／操作者綁定，換帳號應清掉） */
const CHECKIN_SESSION_KEYS = ["books", "adminName"] as const;

/** 登出或切換帳號時清掉客戶端快取（不含標籤列印 localStorage 偏好） */
export function clearClientAuthCaches(): void {
  clearAdminOrgInfoCache();

  if (typeof window === "undefined") return;

  for (const key of CHECKIN_SESSION_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* private mode */
    }
  }

  window.dispatchEvent(new Event("booksnap:session-changed"));
}
