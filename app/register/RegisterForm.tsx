"use client";

import { useActionState, useState } from "react";
import { registerAction, type RegisterState } from "./actions";

const initial: RegisterState = {};

const CITIES = [
  "台北市",
  "新北市",
  "桃園市",
  "台中市",
  "台南市",
  "高雄市",
  "基隆市",
  "新竹市",
  "嘉義市",
  "新竹縣",
  "苗栗縣",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義縣",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const v = state?.values ?? {};
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
            {CITIES.map((c) => (
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

      {state?.error && (
        <div className="px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
      >
        {pending ? "送出中…" : "送出註冊申請"}
      </button>

      <p className="text-xs text-neutral-500 leading-relaxed">
        送出後，會由營運方人工審核。審核通過後即可使用此 Email 與密碼登入。
      </p>
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
