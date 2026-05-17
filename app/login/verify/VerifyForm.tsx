"use client";

import { useActionState, useEffect, useRef } from "react";
import { useToast } from "@/components/ToastProvider";
import {
  verifyLoginMfaAction,
  superAdminVerifyLoginMfaAction,
  type LoginVerifyState,
} from "./actions";

const initial: LoginVerifyState = {};

export default function VerifyForm({
  next,
  variant,
}: {
  next: string;
  variant: "unit" | "super";
}) {
  const action = variant === "super"
    ? superAdminVerifyLoginMfaAction
    : verifyLoginMfaAction;
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

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          驗證碼
        </label>
        <input
          type="text"
          name="code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="••••••"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-300 tracking-[0.4em] text-center font-mono focus:outline-none focus:border-neutral-900 transition"
        />
      </div>

      <p className="text-xs text-neutral-500 leading-relaxed">
        從您的驗證 App（如 Google Authenticator、1Password、Authy）取得當前的 6 碼驗證碼。
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
            {pending ? "驗證中…" : "驗證"}
          </button>
        </div>
      </div>
    </form>
  );
}
