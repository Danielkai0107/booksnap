/**
 * Shape returned by the `registerAction` server action. Lives in a separate
 * (non `"use server"`) module because Next.js 16's stricter server-action
 * convention rejects any non-async export from a `"use server"` file — types,
 * constants, and helpers all have to live outside the actions module.
 */
export type RegisterState = {
  error?: string;
  values?: {
    city?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
};
