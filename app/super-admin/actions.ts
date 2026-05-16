"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_ORDER, type OrgPlan } from "@/lib/plans";
import { writeAuditLog } from "@/lib/billing/apply";

async function assertSuperAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const role = data.user?.app_metadata?.role;
  if (role !== "super_admin") {
    throw new Error("forbidden");
  }
  return { userId: data.user!.id };
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

const TW_CITIES = new Set([
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
]);

export type UpdateOrgInput = {
  name: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
};

export async function updateOrganization(
  orgId: string,
  input: UpdateOrgInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertSuperAdmin();

  const name = input.name.trim();
  const city = input.city.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  const contactPhone = input.contactPhone.trim();

  if (!name) return { ok: false, error: "請填寫單位名稱" };
  if (!TW_CITIES.has(city)) return { ok: false, error: "縣市不在允許清單" };
  if (!contactEmail) return { ok: false, error: "請填寫 Email" };
  if (!contactPhone) return { ok: false, error: "請填寫聯絡電話" };

  const admin = createAdminClient();

  // Read current org to detect email change
  const { data: current, error: readErr } = await admin
    .from("organizations")
    .select("contact_email, owner_user_id")
    .eq("id", orgId)
    .maybeSingle();
  if (readErr || !current) {
    return { ok: false, error: readErr?.message ?? "找不到單位" };
  }

  const { error: updateErr } = await admin
    .from("organizations")
    .update({
      name,
      city,
      contact_email: contactEmail,
      contact_phone: contactPhone,
    })
    .eq("id", orgId);
  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  // Keep the auth user's login email in sync with contact_email
  if (
    current.contact_email !== contactEmail &&
    current.owner_user_id
  ) {
    const { error: authErr } = await admin.auth.admin.updateUserById(
      current.owner_user_id,
      { email: contactEmail, email_confirm: true }
    );
    if (authErr) {
      return {
        ok: false,
        error: `單位資料已更新，但登入 Email 同步失敗：${authErr.message}`,
      };
    }
  }

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
  return { ok: true };
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

export async function updateOrganizationPlan(
  orgId: string,
  plan: OrgPlan
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  if (!PLAN_ORDER.includes(plan)) {
    return { ok: false, error: "不支援的方案" };
  }
  const admin = createAdminClient();
  const { data: before } = await admin
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();
  const { error } = await admin
    .from("organizations")
    .update({ plan })
    .eq("id", orgId);
  if (error) {
    return { ok: false, error: error.message };
  }
  // 人工切換方案會繞過金流；audit log 留紀錄，便於日後對帳。
  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "plan.changed.by_admin",
    target_org_id: orgId,
    meta: {
      from_plan: before?.plan ?? null,
      to_plan: plan,
    },
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
  return { ok: true };
}

export async function setOrganizationBypassQuota(
  orgId: string,
  bypass: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ bypass_quota: bypass })
    .eq("id", orgId);
  if (error) {
    return { ok: false, error: error.message };
  }
  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: bypass ? "org.bypass_quota.granted" : "org.bypass_quota.revoked",
    target_org_id: orgId,
    meta: null,
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
  revalidatePath("/super-admin/settings");
  return { ok: true };
}

export async function superAdminSignOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/super-admin/login");
}
