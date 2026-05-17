import { createAdminClient } from "@/lib/supabase/admin";

/** 單位使用者密碼登入／Email OTP 驗證後的共用檢查。通過回傳 null，否則回傳錯誤訊息。 */
export async function validateUnitLoginUser(
  userId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.organization_id) {
    return "此帳號尚未綁定單位，請聯絡管理員";
  }

  const { data: org } = await admin
    .from("organizations")
    .select("status")
    .eq("id", profile.organization_id)
    .maybeSingle();

  if (!org) {
    return "找不到對應單位，請聯絡管理員";
  }
  if (org.status === "pending") {
    return "你的單位仍在審核中，請耐心等候通知";
  }
  if (org.status === "rejected") {
    return "你的單位註冊申請未通過，請聯絡管理員";
  }
  if (org.status === "suspended") {
    return "你的單位已停用，請聯絡管理員";
  }

  return null;
}
