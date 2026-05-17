"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { TW_CITIES } from "@/lib/cities";
import {
  requestRegisterOtp,
  resendRegisterOtp,
  verifyRegisterOtp,
} from "./actions";
import { REGISTER_INITIAL, type RegisterState } from "./types";

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    async (prev, formData) => {
      // Single useActionState across both stages: the action dispatched
      // depends on whichever submit button (or hidden `_intent` field) the
      // user hit. Keeping a single state machine avoids the awkward two-
      // action-states-fighting situation on stage transitions.
      const intent = String(formData.get("_intent") ?? "");
      if (intent === "verify") return verifyRegisterOtp(prev, formData);
      if (intent === "resend") return resendRegisterOtp(prev, formData);
      return requestRegisterOtp(prev, formData);
    },
    REGISTER_INITIAL
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
    const info = state.stage === "verify" ? state.info ?? null : null;
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
    <form action={action} className="mt-8 space-y-4">
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
        送出後我們會寄出 6 碼驗證碼到您的 Email，驗證後即可開始使用。
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
            {pending ? "寄送中…" : "下一步：寄送驗證碼"}
          </button>
        </div>
      </div>
    </form>
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
  return (
    <div className="mt-8 space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-700 leading-relaxed">
        <p className="font-medium text-neutral-900">驗證信已寄出</p>
        <p className="mt-1.5 text-neutral-600 break-all">
          請檢查 <span className="font-medium">{state.email}</span>{" "}
          的信箱，並輸入信中的 6 碼驗證碼。
        </p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="_intent" value="verify" />
        <Field label="驗證碼">
          <input
            type="text"
            name="token"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="••••••"
            className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-300 tracking-[0.4em] text-center font-mono focus:outline-none focus:border-neutral-900 transition"
          />
        </Field>

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
              {pending ? "驗證中…" : "完成註冊"}
            </button>
          </div>
        </div>
      </form>

      <form action={action} className="text-center">
        <input type="hidden" name="_intent" value="resend" />
        <button
          type="submit"
          disabled={pending}
          className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline transition disabled:opacity-50"
        >
          沒收到信？重新寄送驗證碼
        </button>
      </form>
    </div>
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
