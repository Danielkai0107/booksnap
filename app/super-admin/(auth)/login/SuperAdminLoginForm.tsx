"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useToast } from "@/components/ToastProvider";
import AuthStepForm from "@/components/AuthStepForm";
import {
  superAdminLoginAction,
  type SaLoginState,
} from "./actions";

const initial: SaLoginState = {};

export default function SuperAdminLoginForm({
  initialNotice,
}: {
  initialNotice?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    superAdminLoginAction,
    initial
  );
  const toast = useToast();
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
    <AuthStepForm
      action={formAction}
      footer={
        <>
          <p className="mb-4 text-center text-sm">
            <Link
              href="/super-admin/forgot-password"
              className="text-neutral-500 hover:text-neutral-900 hover:underline"
            >
              忘記密碼？
            </Link>
          </p>
          <button
            type="submit"
            disabled={pending}
            className="w-full h-[46px] bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-sm font-medium rounded-lg transition"
          >
            {pending ? "登入中…" : "登入"}
          </button>
        </>
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
      </div>
    </AuthStepForm>
  );
}
