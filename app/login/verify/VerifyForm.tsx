"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import AuthStepForm from "@/components/AuthStepForm";
import OtpInput from "@/components/OtpInput";
import { useToast } from "@/components/ToastProvider";
import { maskEmailForDisplay } from "@/lib/mask-email";
import {
  verifyLoginOtpAction,
  superAdminVerifyLoginOtpAction,
  resendLoginOtpByEmail,
  type LoginVerifyState,
} from "./actions";

const initial: LoginVerifyState = {};
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyForm({
  email,
  next,
  variant,
}: {
  email: string;
  next: string;
  variant: "unit" | "super";
}) {
  const action =
    variant === "super"
      ? superAdminVerifyLoginOtpAction
      : verifyLoginOtpAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const toast = useToast();
  const lastErrorRef = useRef<string | null>(null);

  const loginPath = variant === "super" ? "/super-admin/login" : "/login";

  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendPending, startResend] = useTransition();

  useEffect(() => {
    const err = state?.error ?? null;
    if (err && err !== lastErrorRef.current) {
      lastErrorRef.current = err;
      toast.error(err);
    } else if (!err) {
      lastErrorRef.current = null;
    }
  }, [state, toast]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  function handleResend() {
    if (secondsLeft > 0 || resendPending) return;
    startResend(async () => {
      const res = await resendLoginOtpByEmail(email);
      if (res.ok) {
        toast.success("已重新寄送驗證信，請查收信箱");
        setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      } else {
        toast.error(res.error ?? "重新寄送失敗，請稍後再試");
      }
    });
  }

  const resendLabel = resendPending
    ? "寄送中…"
    : secondsLeft > 0
      ? `重新寄送驗證信（${secondsLeft} 秒）`
      : "重新寄送驗證信";

  return (
    <AuthStepForm
      action={formAction}
      footer={
        <>
          <button
            type="button"
            onClick={handleResend}
            disabled={secondsLeft > 0 || resendPending || pending}
            className="mb-5 w-full text-center text-sm text-neutral-600 hover:text-neutral-900 disabled:text-neutral-400 disabled:cursor-not-allowed transition"
          >
            {resendLabel}
          </button>
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
              {pending ? "驗證中…" : "完成登入"}
            </button>
          </div>
        </>
      }
    >
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <OtpInput
        name="token"
        required
        autoFocus
        length={6}
        maxLength={10}
      />
      <p className="mt-5 w-full text-center text-xs text-neutral-500">
        已發送給 {maskEmailForDisplay(email)}
      </p>
    </AuthStepForm>
  );
}
