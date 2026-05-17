"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import {
  forgotPasswordAction,
  superAdminForgotPasswordAction,
  type ForgotPasswordState,
} from "./actions";

const initial: ForgotPasswordState = {};

type Props = {
  /** "unit" → /reset-password；"super" → /super-admin/reset-password 配套用 */
  variant: "unit" | "super";
};

export default function ForgotPasswordForm({ variant }: Props) {
  const action = variant === "super"
    ? superAdminForgotPasswordAction
    : forgotPasswordAction;
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

  const resetPath = variant === "super"
    ? "/super-admin/reset-password"
    : "/reset-password";
  const loginPath = variant === "super" ? "/super-admin/login" : "/login";

  if (state?.ok) {
    const otpHref = state.email
      ? `${resetPath}?email=${encodeURIComponent(state.email)}`
      : resetPath;
    return (
      <div className="mt-8 space-y-6">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-700 leading-relaxed">
          <p className="font-medium text-neutral-900">驗證信已寄出</p>
          <p className="mt-1.5 text-neutral-600">
            如果這個 Email 有對應的帳號，您應該很快會在信箱看到一封來自 booksnap 的重設密碼信。請點擊信中的連結，或複製 6 碼驗證碼。
          </p>
        </div>

        <Link
          href={otpHref}
          className="block w-full text-center h-[46px] leading-[44px] rounded-lg border border-neutral-300 text-sm font-medium text-neutral-900 hover:bg-neutral-50 transition"
        >
          我有驗證碼，直接輸入
        </Link>

        <p className="text-center text-sm text-neutral-500">
          <Link
            href={loginPath}
            className="text-neutral-900 font-medium hover:underline"
          >
            返回登入
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="輸入註冊用的 Email"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </div>

      <p className="text-xs text-neutral-500 leading-relaxed">
        我們會寄出含連結與 6 碼驗證碼的重設信，連結與驗證碼擇一即可。
      </p>

      <div
        className="fixed inset-x-0 bottom-0 z-10 px-6 pt-4 bg-white md:static md:p-0 md:bg-transparent"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <div className="max-w-sm mx-auto">
          <button
            type="submit"
            disabled={pending}
            className="w-full h-[46px] bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-sm font-medium rounded-lg transition"
          >
            {pending ? "寄送中…" : "寄送驗證信"}
          </button>
        </div>
      </div>
    </form>
  );
}
