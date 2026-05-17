"use client";

import { useActionState, useEffect, useRef } from "react";
import AuthOtpStepForm from "@/components/AuthOtpStepForm";
import OtpInput from "@/components/OtpInput";
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
  const action =
    variant === "super"
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
    <AuthOtpStepForm
      action={formAction}
      footer={
        <button
          type="submit"
          disabled={pending}
          className="w-full h-[46px] bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-sm font-medium rounded-lg transition"
        >
          {pending ? "驗證中…" : "驗證"}
        </button>
      }
    >
      <input type="hidden" name="next" value={next} />
      <OtpInput
        name="code"
        required
        autoFocus
        length={6}
        maxLength={6}
      />
      <p className="mt-5 w-full max-w-xs text-center text-xs text-neutral-500 leading-relaxed">
        從您的驗證 App（如 Google Authenticator、1Password、Authy）取得當前的 6 碼驗證碼。
      </p>
    </AuthOtpStepForm>
  );
}
