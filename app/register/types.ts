/**
 * Shape returned by the register server actions. Lives in a separate
 * (non `"use server"`) module because Next.js 16's stricter server-action
 * convention rejects any non-async export from a `"use server"` file — types,
 * constants, and helpers all have to live outside the actions module.
 *
 * Stage state machine:
 *   - `form`   → 表單階段（city/name/email/phone/password）
 *   - `verify` → 已寄出驗證信，等待 6 碼 OTP
 */
export type RegisterValues = {
  city?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type RegisterState =
  | {
      stage: "form";
      error?: string;
      values?: RegisterValues;
    }
  | {
      stage: "verify";
      email: string;
      values: RegisterValues;
      info?: string;
      error?: string;
    };

export const REGISTER_INITIAL: RegisterState = { stage: "form" };
