"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SaLoginState = {
  error?: string;
};

export async function superAdminLoginAction(
  _prev: SaLoginState,
  formData: FormData
): Promise<SaLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "請輸入 Email 與密碼" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { error: "帳號或密碼不正確" };
  }

  const role =
    (data.user.app_metadata?.role as "unit" | "super_admin" | undefined) ??
    null;

  if (role !== "super_admin") {
    await supabase.auth.signOut();
    return { error: "此帳號沒有超級管理員權限" };
  }

  redirect("/super-admin");
}
