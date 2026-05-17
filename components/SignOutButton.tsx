"use client";

import { useTransition, type ReactNode } from "react";
import { clearClientAuthCaches } from "@/lib/client-auth-cache";

/** 側邊欄底部登出：描邊按鈕，與主導覽區分 */
export const signOutOutlineClass =
  "flex items-center gap-2.5 w-full px-2 py-2.5 rounded-lg text-sm border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 transition disabled:opacity-60";

type Props = {
  action: () => Promise<void>;
  className?: string;
  children?: ReactNode;
  /** 例如關閉手機側欄 */
  onClick?: () => void;
};

/** 先清客戶端快取再執行 server signOut，避免下一個帳號看到舊單位資料 */
export default function SignOutButton({
  action,
  className,
  children = "登出",
  onClick,
}: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        onClick?.();
        startTransition(async () => {
          clearClientAuthCaches();
          await action();
        });
      }}
      className={className}
    >
      {pending ? "登出中…" : children}
    </button>
  );
}
