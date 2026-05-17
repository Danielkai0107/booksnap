"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearClientAuthCaches } from "@/lib/client-auth-cache";
import {
  clearAdminOrgInfoCache,
  refreshAdminOrgInfo,
} from "@/lib/admin-org-info";
import { supabase } from "@/lib/supabase";

/**
 * 監聽 Supabase session 變化：登出清快取；切換帳號重載目前頁，避免舊單位資料殘留。
 */
export default function AuthSessionSync() {
  const router = useRouter();
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      lastUserIdRef.current = data.session?.user?.id ?? null;
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id ?? null;
      const prevUserId = lastUserIdRef.current;

      if (event === "SIGNED_OUT") {
        clearClientAuthCaches();
        lastUserIdRef.current = null;
        router.refresh();
        return;
      }

      if (
        event !== "SIGNED_IN" &&
        event !== "INITIAL_SESSION" &&
        event !== "USER_UPDATED"
      ) {
        return;
      }

      if (!userId) return;

      const switchedAccount = prevUserId !== null && prevUserId !== userId;

      if (switchedAccount) {
        clearClientAuthCaches();
        void refreshAdminOrgInfo();
        lastUserIdRef.current = userId;
        const path =
          window.location.pathname + window.location.search + window.location.hash;
        window.location.assign(path);
        return;
      }

      if (prevUserId !== userId) {
        clearAdminOrgInfoCache();
        void refreshAdminOrgInfo();
        router.refresh();
      }

      lastUserIdRef.current = userId;
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
