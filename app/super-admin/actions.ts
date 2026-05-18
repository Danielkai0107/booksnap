"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  invalidateAppSettingsCache,
  invalidatePlanConfigsCache,
  loadAppSettings,
} from "@/lib/plans";
import { writeAuditLog } from "@/lib/billing/apply";
import { getGateway } from "@/lib/billing";
import { signOutLocal } from "@/lib/auth/sign-out";
import { toUserMessage } from "@/lib/errors/user-message";
import type { SubscriptionRow } from "@/lib/supabase/types";

async function assertSuperAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const role = data.user?.app_metadata?.role;
  if (role !== "super_admin") {
    throw new Error("forbidden");
  }
  return { userId: data.user!.id };
}

/**
 * Approving an org also stamps the trial window (now + global trial_days from
 * `app_settings`). Re-approving an already-approved org refreshes the trial
 * only when `trial_ends_at` is null (so VIP / paid orgs never lose state).
 */
export async function approveOrganization(orgId: string): Promise<void> {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { trialDays } = await loadAppSettings(admin);
  const now = new Date();
  const trialEnds = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  const { data: existing } = await admin
    .from("organizations")
    .select("trial_ends_at, plan")
    .eq("id", orgId)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    status: "approved",
    approved_at: now.toISOString(),
    rejected_reason: null,
  };
  if (!existing?.trial_ends_at && existing?.plan !== "pro") {
    updates.trial_ends_at = trialEnds.toISOString();
  }

  const { error } = await admin
    .from("organizations")
    .update(updates)
    .eq("id", orgId);
  if (error) throw error;
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
}

export async function rejectOrganization(
  orgId: string,
  reason: string,
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
  input: UpdateOrgInput,
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

  const { data: current, error: readErr } = await admin
    .from("organizations")
    .select("contact_email, owner_user_id")
    .eq("id", orgId)
    .maybeSingle();
  if (readErr || !current) {
    return { ok: false, error: toUserMessage(readErr, "找不到單位") };
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
    return { ok: false, error: toUserMessage(updateErr, "更新單位失敗") };
  }

  if (current.contact_email !== contactEmail && current.owner_user_id) {
    const { error: authErr } = await admin.auth.admin.updateUserById(
      current.owner_user_id,
      { email: contactEmail, email_confirm: true },
    );
    if (authErr) {
      return {
        ok: false,
        error: `單位資料已更新，但登入 Email 同步失敗：${toUserMessage(authErr, "請稍後再試")}`,
      };
    }
  }

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
  return { ok: true };
}

export async function resetOrganizationPassword(
  orgId: string,
  newPassword: string,
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
    return { ok: false, error: toUserMessage(error, "重設密碼失敗") };
  }
  return { ok: true };
}

/**
 * Manually activate a paid subscription for an org without going through the
 * checkout flow. Routes through the same `applyGatewayEvent` pipeline as a
 * real webhook so all downstream effects (subscription row, payment row,
 * audit log) fire identically.
 *
 * Used by super-admin to grant paid access to demo / VIP / friends-of-the-team
 * orgs. Refuses when a live subscription already exists.
 */
export async function grantPaidSubscription(
  orgId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, contact_email, plan")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "找不到單位" };

  const { data: existing } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  const current = (existing as SubscriptionRow | null) ?? null;
  if (
    current &&
    (current.status === "active" || current.status === "past_due") &&
    !current.cancel_at_period_end
  ) {
    return { ok: false, error: "此單位已有進行中的訂閱" };
  }

  // If there is a "cancelled but still inside period" sub, just resume it.
  if (
    current &&
    (current.status === "active" || current.status === "past_due") &&
    current.cancel_at_period_end
  ) {
    try {
      await getGateway().resume(current.gateway_sub_id);
      await writeAuditLog(admin, {
        actor_id: userId,
        actor_role: "super_admin",
        action: "sub.granted_by_admin",
        target_org_id: orgId,
        meta: { mode: "resume" },
      });
      revalidatePath("/super-admin");
      revalidatePath("/super-admin/organizations");
      revalidatePath("/super-admin/subscriptions");
      revalidatePath("/billing");
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "resume_failed",
      };
    }
  }

  try {
    await getGateway().createSubscription({
      orgId: org.id,
      plan: "pro",
      orgName: org.name,
      contactEmail: org.contact_email,
      successUrl: "/billing?welcome=1",
      cancelUrl: "/billing",
    });
    await writeAuditLog(admin, {
      actor_id: userId,
      actor_role: "super_admin",
      action: "sub.granted_by_admin",
      target_org_id: orgId,
      meta: { mode: "create" },
    });
    revalidatePath("/super-admin");
    revalidatePath("/super-admin/organizations");
    revalidatePath("/super-admin/subscriptions");
    revalidatePath("/billing");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "grant_failed",
    };
  }
}

/**
 * Cancel a paid subscription. `mode` decides whether to schedule the cancel
 * at the end of the current period (default, refund-friendly) or take effect
 * immediately (refunds, fraud cases).
 */
export async function cancelOrganizationSubscription(
  orgId: string,
  mode: "period_end" | "immediate",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  const row = (sub as SubscriptionRow | null) ?? null;
  if (!row) return { ok: false, error: "此單位沒有訂閱" };

  if (mode === "period_end") {
    try {
      await getGateway().cancelAtPeriodEnd(row.gateway_sub_id);
      await writeAuditLog(admin, {
        actor_id: userId,
        actor_role: "super_admin",
        action: "sub.cancelled_by_admin",
        target_org_id: orgId,
        meta: { mode },
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "cancel_failed",
      };
    }
  } else {
    const nowIso = new Date().toISOString();
    const { error: subErr } = await admin
      .from("subscriptions")
      .update({
        status: "cancelled",
        current_period_end: nowIso,
        cancel_at_period_end: true,
        cancelled_at: nowIso,
        scheduled_plan: "trial",
      })
      .eq("id", row.id);
    if (subErr) {
      return { ok: false, error: toUserMessage(subErr, "更新訂閱失敗") };
    }
    await writeAuditLog(admin, {
      actor_id: userId,
      actor_role: "super_admin",
      action: "sub.cancelled_by_admin",
      target_org_id: orgId,
      meta: { mode },
    });
  }

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
  revalidatePath("/super-admin/subscriptions");
  revalidatePath("/billing");
  return { ok: true };
}

/**
 * Push out the trial deadline by `days`. The new deadline is
 * `max(now, trial_ends_at) + days`, so extending an already-expired trial
 * counts from today (no retroactive credit).
 */
export async function extendOrganizationTrial(
  orgId: string,
  days: number,
): Promise<{ ok: true; newTrialEndsAt: string } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "天數需為 > 0 的整數" };
  }
  if (n > 365) {
    return { ok: false, error: "單次最多 365 天" };
  }
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("plan, trial_ends_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "找不到單位" };
  if (org.plan === "pro") {
    return { ok: false, error: "Pro 單位不需要延長體驗" };
  }

  const now = Date.now();
  const base = org.trial_ends_at
    ? Math.max(now, new Date(org.trial_ends_at).getTime())
    : now;
  const next = new Date(base + n * 24 * 60 * 60 * 1000);

  const { error } = await admin
    .from("organizations")
    .update({ trial_ends_at: next.toISOString() })
    .eq("id", orgId);
  if (error) {
    return { ok: false, error: toUserMessage(error, "延長失敗") };
  }

  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "trial.extended",
    target_org_id: orgId,
    meta: {
      days: n,
      from: org.trial_ends_at,
      to: next.toISOString(),
    },
  });

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
  return { ok: true, newTrialEndsAt: next.toISOString() };
}

/**
 * Immediately end an org's trial — sets `trial_ends_at = now`, which puts
 * `isOrgLocked()` into the "expired_trial" branch on the next request. Useful
 * for support flows where we want to stop free use right now (no period_end
 * grace). Refuses Pro orgs (use `cancelOrganizationSubscription` instead).
 */
export async function endOrganizationTrial(
  orgId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("plan, trial_ends_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "找不到單位" };
  if (org.plan === "pro") {
    return { ok: false, error: "Pro 單位請改用「取消付費」" };
  }

  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("organizations")
    .update({ trial_ends_at: nowIso })
    .eq("id", orgId);
  if (error) {
    return { ok: false, error: toUserMessage(error, "結束體驗失敗") };
  }

  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "trial.ended_by_admin",
    target_org_id: orgId,
    meta: { from: org.trial_ends_at, to: nowIso },
  });

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
  return { ok: true };
}

/**
 * Reset an org back to a fresh-trial state — as if it had just been approved.
 *
 *   - Deletes the subscription row (payments.subscription_id is
 *     `ON DELETE SET NULL` so payment history is preserved for audit).
 *   - Sets `plan = 'trial'` (defensive, in case a Pro org is being reset).
 *   - Sets `trial_ends_at = now + global trial_days`.
 *
 * Unlike `extendOrganizationTrial`, this OVERWRITES — it does not stack on
 * the existing deadline. Used for demo refresh, customer rescue, or test
 * harnesses that want to re-run the trial flow.
 */
export async function resetOrganizationTrial(
  orgId: string,
): Promise<{ ok: true; newTrialEndsAt: string } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("plan, trial_ends_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "找不到單位" };

  const { trialDays } = await loadAppSettings(admin);
  const next = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  // 1) Wipe the subscription. `payments.subscription_id` is ON DELETE SET NULL
  // so payment history rows survive (just lose their FK).
  const { error: subErr } = await admin
    .from("subscriptions")
    .delete()
    .eq("organization_id", orgId);
  if (subErr) {
    return { ok: false, error: toUserMessage(subErr, "刪除訂閱失敗") };
  }

  // 2) Reset plan + trial deadline to brand-new-account state.
  const { error } = await admin
    .from("organizations")
    .update({ plan: "trial", trial_ends_at: next.toISOString() })
    .eq("id", orgId);
  if (error) {
    return { ok: false, error: toUserMessage(error, "重置體驗失敗") };
  }

  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "trial.reset_by_admin",
    target_org_id: orgId,
    meta: {
      days: trialDays,
      from_plan: org.plan,
      from_trial_ends_at: org.trial_ends_at,
      to_trial_ends_at: next.toISOString(),
    },
  });

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
  revalidatePath("/super-admin/subscriptions");
  revalidatePath("/billing");
  return { ok: true, newTrialEndsAt: next.toISOString() };
}

/**
 * Update the global default trial length used by `approveOrganization`. Does
 * not retroactively change existing trials.
 */
export async function setTrialDays(
  days: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "天數需為 > 0 的整數" };
  }
  if (n > 365) {
    return { ok: false, error: "最多 365 天" };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert(
      {
        key: "trial_days",
        value: n,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "key" },
    );
  if (error) {
    return { ok: false, error: toUserMessage(error, "儲存失敗") };
  }
  invalidateAppSettingsCache();
  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "settings.trial_days_changed",
    target_org_id: null,
    meta: { days: n },
  });
  revalidatePath("/super-admin/settings");
  return { ok: true };
}

/**
 * Master billing switch. While `false` the `/billing` page shows a
 * BillingPausedBanner and disables the 升級 Pro CTA; every locked entry
 * point in the app (新書入庫 / 借閱連結 / sidebar 升級膠囊) just navigates
 * to `/billing` so the user sees the full upgrade context in one place.
 * Lets us ship features before a real gateway is connected.
 */
export async function setBillingEnabled(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("app_settings").upsert(
    {
      key: "billing_enabled",
      value: enabled,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "key" },
  );
  if (error) {
    return { ok: false, error: toUserMessage(error, "儲存失敗") };
  }
  invalidateAppSettingsCache();
  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: enabled
      ? "settings.billing_enabled"
      : "settings.billing_disabled",
    target_org_id: null,
    meta: { enabled },
  });
  revalidatePath("/super-admin/settings");
  revalidatePath("/billing");
  return { ok: true };
}

/**
 * 更新智能辨識使用的 Claude 模型 ID（主要 + 可選備用）。
 *
 * 主要與備用儲存於 `app_settings`，`/api/recognize` 每次呼叫都會經 60s 快取讀取，
 * 因此調整後最遲 1 分鐘生效（無需 redeploy）。備用模型只在「主要呼叫 fetch
 * 失敗或非 2xx」時自動跑一次，純韌性 fallback，不處理「無法識別」這種品質失敗。
 *
 * 驗證採寬鬆策略：trim 後僅要求 `claude-` 前綴（避免手滑打到 gpt-4o 之類），
 * 實際模型是否存在交給 Anthropic API 回應檢查。
 */
export async function setAiRecognizeModels(
  primary: string,
  fallback: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();

  const primaryTrim = primary.trim();
  const fallbackTrim = fallback.trim();
  if (!primaryTrim) {
    return { ok: false, error: "主要模型不可為空" };
  }
  if (!primaryTrim.toLowerCase().startsWith("claude-")) {
    return { ok: false, error: "主要模型需以 claude- 開頭" };
  }
  if (primaryTrim.length > 80) {
    return { ok: false, error: "主要模型 ID 過長" };
  }
  if (fallbackTrim) {
    if (!fallbackTrim.toLowerCase().startsWith("claude-")) {
      return { ok: false, error: "備用模型需以 claude- 開頭" };
    }
    if (fallbackTrim.length > 80) {
      return { ok: false, error: "備用模型 ID 過長" };
    }
    if (fallbackTrim === primaryTrim) {
      return { ok: false, error: "備用模型不能與主要模型相同" };
    }
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const rows = [
    {
      key: "ai_recognize_model_primary",
      value: primaryTrim,
      updated_at: now,
      updated_by: userId,
    },
    {
      // 空字串代表「清除備用」。jsonb 接受空字串，coerceModelName 也會
      // 退回成 null，讓 /api/recognize 自動關掉 fallback。
      key: "ai_recognize_model_fallback",
      value: fallbackTrim,
      updated_at: now,
      updated_by: userId,
    },
  ];
  const { error } = await admin
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) {
    return { ok: false, error: toUserMessage(error, "儲存失敗") };
  }
  invalidateAppSettingsCache();
  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "settings.ai_recognize_models_changed",
    target_org_id: null,
    meta: { primary: primaryTrim, fallback: fallbackTrim || null },
  });
  revalidatePath("/super-admin/settings");
  return { ok: true };
}

export async function setOrganizationBypassQuota(
  orgId: string,
  bypass: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ bypass_quota: bypass })
    .eq("id", orgId);
  if (error) {
    return { ok: false, error: toUserMessage(error, "更新失敗") };
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

export type UpdatePlanPriceInput = {
  monthlyPrice: number;
};

/**
 * Updates the editable monthly price of the single paid tier. Only `pro` is a
 * valid plan after the 2026-05 simplification; the function still accepts a
 * plan param for symmetry but rejects anything else.
 */
export async function updatePlanPrice(
  plan: "pro",
  input: UpdatePlanPriceInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  if (plan !== "pro") {
    return { ok: false, error: "不支援的方案" };
  }

  const monthlyPrice = Math.floor(Number(input.monthlyPrice));
  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
    return { ok: false, error: "價格需為 ≥ 0 的整數" };
  }

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("plan_configs")
    .select("monthly_price")
    .eq("plan", "pro")
    .maybeSingle();

  const { error: writeErr } = await admin
    .from("plan_configs")
    .update({
      monthly_price: monthlyPrice,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("plan", "pro");
  if (writeErr) {
    return { ok: false, error: toUserMessage(writeErr, "儲存方案設定失敗") };
  }

  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "plan_config.updated",
    target_org_id: null,
    meta: {
      plan,
      before: before?.monthly_price ?? null,
      after: monthlyPrice,
    },
  });

  invalidatePlanConfigsCache();
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/plans");
  revalidatePath("/super-admin/organizations");
  revalidatePath("/super-admin/subscriptions");
  revalidatePath("/billing");
  return { ok: true };
}

/**
 * Permanently delete an organization and all its data.
 *
 * Order of operations:
 *   1. Wipe storage objects under `book-covers/{orgId}/` (paginated; storage
 *      has no CASCADE).
 *   2. Write the audit log row BEFORE the delete — `audit_logs.target_org_id`
 *      has `ON DELETE SET NULL`, so the log row survives but loses the FK.
 *   3. Delete the `organizations` row. All children
 *      (books, subscriptions, payments, profiles, ai_usage_logs, …) cascade.
 *   4. Delete the Supabase auth user that owned the org (no CASCADE between
 *      `auth.users` and `public.profiles`/`organizations`).
 *
 * Caller must pass the org name as `confirmName` (typed in the UI) to avoid
 * accidental clicks — this is irreversible.
 */
export async function deleteOrganization(
  orgId: string,
  confirmName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await assertSuperAdmin();
  const admin = createAdminClient();

  const { data: org, error: readErr } = await admin
    .from("organizations")
    .select("id, name, owner_user_id")
    .eq("id", orgId)
    .maybeSingle();
  if (readErr || !org) {
    return { ok: false, error: toUserMessage(readErr, "找不到單位") };
  }
  if (confirmName.trim() !== org.name) {
    return { ok: false, error: "確認字串不符合單位名稱" };
  }

  // 1) Storage: page through book-covers/{orgId}/ and remove in batches.
  // Pagination protects against orgs with > 1000 book covers.
  const PAGE = 1000;
  for (;;) {
    const { data: files, error: listErr } = await admin.storage
      .from("book-covers")
      .list(orgId, { limit: PAGE });
    if (listErr) {
      console.error("[deleteOrganization] storage list error", listErr);
      break; // best-effort; continue to DB delete
    }
    if (!files || files.length === 0) break;
    const paths = files.map((f) => `${orgId}/${f.name}`);
    const { error: rmErr } = await admin.storage
      .from("book-covers")
      .remove(paths);
    if (rmErr) {
      console.error("[deleteOrganization] storage remove error", rmErr);
      break;
    }
    if (files.length < PAGE) break;
  }

  // 2) Audit log written before deletion so `target_org_id` is still valid;
  // CASCADE on audit_logs sets it to NULL after the delete completes.
  await writeAuditLog(admin, {
    actor_id: userId,
    actor_role: "super_admin",
    action: "org.deleted_by_admin",
    target_org_id: orgId,
    meta: {
      name: org.name,
      owner_user_id: org.owner_user_id,
    },
  });

  // 3) Delete the org. All FK children CASCADE except audit_logs (SET NULL).
  const { error: deleteErr } = await admin
    .from("organizations")
    .delete()
    .eq("id", orgId);
  if (deleteErr) {
    return { ok: false, error: toUserMessage(deleteErr, "刪除單位失敗") };
  }

  // 4) Delete the auth user. We log failures but don't rollback — the org
  // row is gone and the auth user is now an orphan (can be cleaned up
  // manually if needed).
  if (org.owner_user_id) {
    const { error: authErr } = await admin.auth.admin.deleteUser(
      org.owner_user_id,
    );
    if (authErr) {
      console.error(
        "[deleteOrganization] auth user delete failed (orphan left)",
        authErr,
      );
    }
  }

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/organizations");
  revalidatePath("/super-admin/subscriptions");
  return { ok: true };
}

export async function superAdminSignOut(): Promise<void> {
  const supabase = await createClient();
  await signOutLocal(supabase);
  redirect("/super-admin/login");
}
