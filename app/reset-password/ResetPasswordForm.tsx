"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import {
  resetPasswordAction,
  superAdminResetPasswordAction,
  type ResetPasswordState,
} from "./actions";

const initial: ResetPasswordState = {};

type Props = {
  /** 由 server component 判定：true 表示已透過連結登入，只需新密碼欄位 */
  hasSession: boolean;
  /** 沒 session 時，URL 帶來的 email 預填（OTP fallback 用） */
  prefilledEmail?: string;
  variant: "unit" | "super";
};

export default function ResetPasswordForm({
  hasSession,
  prefilledEmail,
  variant,
}: Props) {
  const action = variant === "super"
    ? superAdminResetPasswordAction
    : resetPasswordAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const toast = useToast();
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const err = state?.error ?? null;
    if (err && err !== lastErrorRef.current) {
      lastErrorRef.current = err;
      toast.error(err);
    } else if (!err) {
      lastErrorRef.current = null;
    }
  }, [state, toast]);

  const forgotPath = variant === "super"
    ? "/super-admin/forgot-password"
    : "/forgot-password";

  return (
    <form action={formAction} className="mt-8 space-y-4">
      {!hasSession && (
        <>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              defaultValue={prefilledEmail ?? ""}
              autoComplete="email"
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">
              驗證碼（信中提供）
            </label>
            <input
              type="text"
              name="token"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6,10}"
              maxLength={10}
              placeholder="輸入信中的數字驗證碼"
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-300 tracking-[0.3em] text-center font-mono focus:outline-none focus:border-neutral-900 transition"
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          新密碼（至少 8 字元）
        </label>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900 transition"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          再次輸入新密碼
        </label>
        <input
          type="password"
          name="passwordConfirm"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900 transition"
        />
      </div>

      <p className="text-xs text-neutral-500 leading-relaxed">
        {hasSession
          ? "重設密碼後將自動登出，請以新密碼重新登入。"
          : "輸入信中的驗證碼後，可直接設定新密碼。重設成功後將自動登出。"}
      </p>

      <div
        className="fixed inset-x-0 bottom-0 z-10 px-6 pt-4 bg-white md:static md:p-0 md:bg-transparent"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <div className="max-w-sm mx-auto space-y-3">
          <button
            type="submit"
            disabled={pending}
            className="w-full h-[46px] bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-sm font-medium rounded-lg transition"
          >
            {pending ? "處理中…" : "重設密碼"}
          </button>
          <p className="text-center text-xs text-neutral-500">
            驗證碼過期了？
            <Link
              href={forgotPath}
              className="ml-1 text-neutral-900 font-medium hover:underline"
            >
              重新寄送
            </Link>
          </p>
        </div>
      </div>
    </form>
  );
}
