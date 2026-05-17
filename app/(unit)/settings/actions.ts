"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeOrganization } from "@/lib/org/purge";

export type DeleteAccountResult = {
  error?: string;
};

export async function deleteAccountAction(
  confirmName: string,
): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "請先登入" };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "unit" || !profile.organization_id) {
    return { error: "無法註銷此帳號" };
  }

  const { data: org } = await admin
    .from("organizations")
    .select("id, owner_user_id, name")
    .eq("id", profile.organization_id)
    .maybeSingle();

  if (!org || org.owner_user_id !== user.id) {
    return { error: "僅單位負責人可註銷帳號" };
  }

  if (confirmName.trim() !== org.name) {
    return { error: "單位名稱不正確" };
  }

  try {
    await purgeOrganization(admin, org.id);
  } catch (err) {
    console.error("[settings] purge organization failed", err);
    return { error: "註銷失敗，請稍後再試或聯絡客服" };
  }

  await supabase.auth.signOut();

  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    console.error("[settings] delete auth user failed", deleteErr);
    return { error: "註銷失敗，請稍後再試或聯絡客服" };
  }

  redirect("/login");
}
