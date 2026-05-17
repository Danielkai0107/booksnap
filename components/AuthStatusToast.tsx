"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

const MESSAGES: Record<string, string> = {
  password_reset: "密碼已更新，已為您登入",
};

/**
 * 讀取 `?status=` 顯示一次性 toast 並清掉 query（用於 server redirect 後提示）。
 *
 * 重要：只在「已知的 status 值」才動 URL，否則會跟其他用 `?status=` 當 filter
 * 的頁面（例如訂閱列表的 tab）衝突，導致使用者一點 tab 就被踢回 homePath。
 */
export default function AuthStatusToast({ homePath }: { homePath: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    const status = searchParams.get("status");
    if (!status) return;
    const message = MESSAGES[status];
    if (!message) return;
    toast.success(message);
    router.replace(homePath, { scroll: false });
  }, [searchParams, toast, router, homePath]);

  return null;
}
