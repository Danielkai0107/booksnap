"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import AuthStepForm from "@/components/AuthStepForm";
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
  const action =
    variant === "super" ? superAdminForgotPasswordAction : forgotPasswordAction;
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

  const loginPath = variant === "super" ? "/super-admin/login" : "/login";

  return (
    <AuthStepForm
      action={formAction}
      footer={
        <div className="flex gap-3">
          <Link
            href={loginPath}
            className="flex-1 h-[46px] inline-flex items-center justify-center rounded-lg border border-neutral-300 text-sm font-medium text-neutral-900 hover:bg-neutral-50 transition"
          >
            返回登入
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 h-[46px] bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-sm font-medium rounded-lg transition"
          >
            {pending ? "寄送中…" : "寄送驗證信"}
          </button>
        </div>
      }
    >
      <div className="w-full space-y-4">
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
          我們會寄出含連結與驗證碼的重設信，按下後將直接進入下一步輸入驗證碼。
        </p>
      </div>
    </AuthStepForm>
  );
}
