"use client";

import { useTransition, type ReactNode } from "react";
import { clearClientAuthCaches } from "@/lib/client-auth-cache";

type Props = {
  action: () => Promise<void>;
  className?: string;
  children?: ReactNode;
};

/** 先清客戶端快取再執行 server signOut，避免下一個帳號看到舊單位資料 */
export default function SignOutButton({
  action,
  className,
  children = "登出",
}: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
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
