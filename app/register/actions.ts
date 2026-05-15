"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export type RegisterState = {
  error?: string;
  values?: {
    city?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
};

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

export async function registerAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const city = String(formData.get("city") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  const values = { city, name, email, phone };

  if (!city || !TW_CITIES.has(city)) {
    return { error: "請選擇縣市", values };
  }
  if (!name) return { error: "請輸入單位名稱", values };
  if (!email) return { error: "請輸入 Email", values };
  if (!phone) return { error: "請輸入聯絡電話", values };
  if (password.length < 8) {
    return { error: "密碼至少 8 個字元", values };
  }
  if (password !== passwordConfirm) {
    return { error: "兩次輸入的密碼不一致", values };
  }

  const admin = createAdminClient();

  // 1. Create auth user
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { unit_name: name },
    app_metadata: { role: "unit" },
  });
  if (userError || !userData.user) {
    const msg = userError?.message ?? "建立帳號失敗";
    return {
      error: /already (registered|exists)/i.test(msg)
        ? "此 Email 已被註冊"
        : msg,
      values,
    };
  }

  const userId = userData.user.id;

  // 2. Create organization (pending)
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name,
      city,
      contact_email: email,
      contact_phone: phone,
      status: "pending",
      owner_user_id: userId,
    })
    .select("id")
    .single();
  if (orgError || !org) {
    // Cleanup the dangling user so register can be retried
    await admin.auth.admin.deleteUser(userId);
    return { error: orgError?.message ?? "建立單位資料失敗", values };
  }

  // 3. Create profile
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    organization_id: org.id,
    role: "unit",
  });
  if (profileError) {
    await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(userId);
    return { error: profileError.message, values };
  }

  redirect("/register/pending");
}
