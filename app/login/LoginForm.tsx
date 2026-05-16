"use client";

import { useActionState, useEffect, useRef } from "react";
import { useToast } from "@/components/ToastProvider";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginForm({
  initialNotice,
}: {
  /** 從 URL searchParams 帶來的提示（單位審核中、被退回、未綁定…） */
  initialNotice?: string | null;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const toast = useToast();
  // Server action 每次回傳都是新物件，避免相同錯誤重彈用 ref 比對識別。
  const lastErrorRef = useRef<string | null>(null);
  const noticeFiredRef = useRef(false);

  useEffect(() => {
    if (initialNotice && !noticeFiredRef.current) {
      noticeFiredRef.current = true;
      toast.info(initialNotice);
    }
  }, [initialNotice, toast]);

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
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900 transition"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          密碼
        </label>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900 transition"
        />
      </div>

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
            {pending ? "登入中…" : "登入"}
          </button>
        </div>
      </div>
    </form>
  );
}
