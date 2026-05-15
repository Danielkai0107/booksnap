"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function assertSuperAdmin(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const role = data.user?.app_metadata?.role;
  if (role !== "super_admin") {
    throw new Error("forbidden");
  }
}

export async function approveOrganization(orgId: string): Promise<void> {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      rejected_reason: null,
    })
    .eq("id", orgId);
  if (error) throw error;
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
}

export async function rejectOrganization(
  orgId: string,
  reason: string
): Promise<void> {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      status: "rejected",
      rejected_reason: reason || null,
    })
    .eq("id", orgId);
  if (error) throw error;
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
}

export async function suspendOrganization(orgId: string): Promise<void> {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ status: "suspended" })
    .eq("id", orgId);
  if (error) throw error;
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
}

export async function reactivateOrganization(orgId: string): Promise<void> {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) throw error;
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
}

export async function resetOrganizationPassword(
  orgId: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertSuperAdmin();
  if (newPassword.length < 8) {
    return { ok: false, error: "密碼至少 8 個字元" };
  }
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("owner_user_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org?.owner_user_id) {
    return { ok: false, error: "此單位沒有對應登入帳號" };
  }
  const { error } = await admin.auth.admin.updateUserById(org.owner_user_id, {
    password: newPassword,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function superAdminSignOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/super-admin/login");
}
