"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { TW_CITIES } from "@/lib/cities";
import { registerAction, type RegisterState } from "./actions";

const initial: RegisterState = {};

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const v = state?.values ?? {};
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
  const [city, setCity] = useState<string>(v.city ?? "");

  return (
    <form action={formAction} className="mt-8 space-y-4">
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
        送出後，會由營運方人工審核。審核通過後即可使用此 Email 與密碼登入。
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
            {pending ? "送出中…" : "送出註冊申請"}
          </button>
        </div>
      </div>
    </form>
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
