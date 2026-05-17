"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import AuthStepForm from "@/components/AuthStepForm";
import {
  resetPasswordAction,
  superAdminResetPasswordAction,
  type ResetPasswordState,
} from "./actions";

const initial: ResetPasswordState = {};

type Props = {
  variant: "unit" | "super";
};

export default function ResetPasswordForm({ variant }: Props) {
  const action =
    variant === "super" ? superAdminResetPasswordAction : resetPasswordAction;
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
            {pending ? "處理中…" : "重設密碼"}
          </button>
        </div>
      }
    >
      <div className="w-full space-y-4">
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
          重設密碼後將自動登出，請以新密碼重新登入。
        </p>
      </div>
    </AuthStepForm>
  );
}
