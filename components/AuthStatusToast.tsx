"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

const MESSAGES: Record<string, string> = {
  password_reset: "密碼已更新，已為您登入",
};

/**
 * 讀取 `?status=` 顯示一次性 toast 並清掉 query（用於 server redirect 後提示）。
 */
export default function AuthStatusToast({ homePath }: { homePath: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    const status = searchParams.get("status");
    if (!status) return;
    const message = MESSAGES[status];
    if (message) toast.success(message);
    router.replace(homePath, { scroll: false });
  }, [searchParams, toast, router, homePath]);

  return null;
}
