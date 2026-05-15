"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
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

  // Super admin must log in via /super-admin/login
  if (role === "super_admin") {
    await supabase.auth.signOut();
    return { error: "此帳號為超級管理員，請改用 /super-admin 登入" };
  }

  // For unit users, check organization status
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    await supabase.auth.signOut();
    return { error: "此帳號尚未綁定單位，請聯絡管理員" };
  }

  const { data: org } = await admin
    .from("organizations")
    .select("status")
    .eq("id", profile.organization_id)
    .maybeSingle();

  if (!org) {
    await supabase.auth.signOut();
    return { error: "找不到對應單位，請聯絡管理員" };
  }

  if (org.status === "pending") {
    await supabase.auth.signOut();
    return { error: "你的單位仍在審核中，請耐心等候通知" };
  }
  if (org.status === "rejected") {
    await supabase.auth.signOut();
    return { error: "你的單位註冊申請未通過，請聯絡管理員" };
  }
  if (org.status === "suspended") {
    await supabase.auth.signOut();
    return { error: "你的單位已停用，請聯絡管理員" };
  }

  redirect("/");
}
