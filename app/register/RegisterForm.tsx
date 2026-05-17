"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import { TW_CITIES } from "@/lib/cities";
import AuthStepForm from "@/components/AuthStepForm";
import OtpInput from "@/components/OtpInput";
import { maskEmailForDisplay } from "@/lib/mask-email";
import {
  requestRegisterOtp,
  resendRegisterOtpByEmail,
  verifyRegisterOtp,
} from "./actions";
import { REGISTER_INITIAL, type RegisterState } from "./types";

const RESEND_COOLDOWN_SECONDS = 60;

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    async (prev, formData) => {
      const intent = String(formData.get("_intent") ?? "");
      if (intent === "verify") return verifyRegisterOtp(prev, formData);
      return requestRegisterOtp(prev, formData);
    },
    REGISTER_INITIAL,
  );

  const toast = useToast();
  const lastErrorRef = useRef<string | null>(null);
  const lastInfoRef = useRef<string | null>(null);

  useEffect(() => {
    const err = state.error ?? null;
    if (err && err !== lastErrorRef.current) {
      lastErrorRef.current = err;
      toast.error(err);
    } else if (!err) {
      lastErrorRef.current = null;
    }
  }, [state, toast]);

  useEffect(() => {
    const info = state.stage === "verify" ? (state.info ?? null) : null;
    if (info && info !== lastInfoRef.current) {
      lastInfoRef.current = info;
      toast.success(info);
    } else if (!info) {
      lastInfoRef.current = null;
    }
  }, [state, toast]);

  if (state.stage === "verify") {
    return <VerifyStage state={state} action={formAction} pending={pending} />;
  }

  return <FormStage state={state} action={formAction} pending={pending} />;
}

function FormStage({
  state,
  action,
  pending,
}: {
  state: Extract<RegisterState, { stage: "form" }>;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const v = state.values ?? {};
  const [city, setCity] = useState<string>(v.city ?? "");

  return (
    <AuthStepForm
      action={action}
      middle="scroll"
      footer={
        <div className="flex gap-3">
          <Link
            href="/login"
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
      <input type="hidden" name="_intent" value="request" />
      <Field label="縣市">
        <div className="relative">
          <select
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            className={`w-full appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-neutral-200 bg-white focus:outline-none focus:border-neutral-900 transition ${
              city === "" ? "text-neutral-400" : "text-neutral-900"
            }`}
          >
            <option value="" disabled>
              請選擇縣市
            </option>
            {TW_CITIES.map((c) => (
              <option key={c} value={c} className="text-neutral-900">
                {c}
              </option>
            ))}
          </select>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
            aria-hidden
          >
            <path d="M3 5l3 3 3-3" />
          </svg>
        </div>
      </Field>

      <Field label="單位名稱">
        <input
          type="text"
          name="name"
          required
          defaultValue={v.name ?? ""}
          placeholder="例：示範幼兒園"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </Field>

      <Field label="Email（登入用）">
        <input
          type="email"
          name="email"
          required
          defaultValue={v.email ?? ""}
          autoComplete="email"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </Field>

      <Field label="聯絡電話">
        <input
          type="tel"
          name="phone"
          required
          defaultValue={v.phone ?? ""}
          placeholder="例：02-1234-5678"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </Field>

      <Field label="密碼（至少 8 字元）">
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </Field>

      <Field label="再次輸入密碼">
        <input
          type="password"
          name="passwordConfirm"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
        />
      </Field>

      <p className="text-xs text-neutral-500 leading-relaxed">
        送出後我們會寄出驗證碼到您的 Email，驗證後即可開始使用。
      </p>
    </AuthStepForm>
  );
}

function VerifyStage({
  state,
  action,
  pending,
}: {
  state: Extract<RegisterState, { stage: "verify" }>;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const toast = useToast();
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendPending, startResend] = useTransition();

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
      const res = await resendRegisterOtpByEmail(state.email);
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
      action={action}
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
              href="/login"
              className="flex-1 h-[46px] inline-flex items-center justify-center rounded-lg border border-neutral-300 text-sm font-medium text-neutral-900 hover:bg-neutral-50 transition"
            >
              返回登入
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 h-[46px] bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-sm font-medium rounded-lg transition"
            >
              {pending ? "驗證中…" : "完成註冊"}
            </button>
          </div>
        </>
      }
    >
      <input type="hidden" name="_intent" value="verify" />
      <OtpInput
        name="token"
        required
        autoFocus
        length={6}
        maxLength={10}
      />
      <p className="mt-5 w-full text-center text-xs text-neutral-500">
        已發送給 {maskEmailForDisplay(state.email)}
      </p>
    </AuthStepForm>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
