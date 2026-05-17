const DEFAULT_FALLBACK = "操作失敗，請稍後再試";

/** 完整比對（Supabase / API 固定字串） */
const EXACT: Record<string, string> = {
  "Invalid login credentials": "帳號或密碼不正確",
  "Email not confirmed": "Email 尚未驗證，請至信箱完成驗證",
  "User already registered": "此 Email 已被註冊",
  "Signup requires a valid password": "密碼格式不符合要求",
  "Password should be at least 6 characters": "密碼至少 6 個字元",
  "New password should be different from the old password": "新密碼不可與舊密碼相同",
  "Auth session missing!": "登入已過期，請重新操作",
  "JWT expired": "登入已過期，請重新登入",
  "Token has expired or is invalid": "驗證碼錯誤或已過期",
  "Email link is invalid or has expired": "驗證連結無效或已過期",
  "Invalid Refresh Token: Refresh Token Not Found": "登入已過期，請重新登入",
  "Email rate limit exceeded": "寄信太頻繁，請稍後再試",
  "over_request_rate_limit": "操作太頻繁，請稍後再試",
  "Unable to validate email address: invalid format": "Email 格式不正確",
  "invalid json": "請求格式錯誤",
  "slug required": "連結不完整，請重新開啟",
  "organization not available": "找不到此單位或單位已停用",
  "public borrowing disabled for this organization": "此單位未開放線上借書",
  "public flow disabled for this organization": "此單位未開放線上借還",
  "phone invalid": "請輸入有效的手機號碼",
  "displayName required": "請填寫姓名",
  "bookIds required": "請先掃描書籍",
  "book not found": "找不到此書籍",
  "catalog disabled for this organization": "此單位未開放館藏查詢",
  "borrower upsert failed": "建立出借人資料失敗",
  gateway_error: "付款服務暫時無法使用，請稍後再試",
  schedule_error: "無法變更方案，請稍後再試",
  apply_error: "無法更新訂閱狀態，請稍後再試",
  failed: "操作失敗，請稍後再試",
};

/** 部分比對（冗長或帶變數的英文訊息） */
const PATTERNS: ReadonlyArray<{ test: RegExp; message: string }> = [
  { test: /invalid login credentials/i, message: "帳號或密碼不正確" },
  { test: /email not confirmed/i, message: "Email 尚未驗證，請至信箱完成驗證" },
  { test: /already (registered|exists)/i, message: "此 Email 已被註冊" },
  { test: /otp|token.*expir|expired.*otp/i, message: "驗證碼錯誤或已過期" },
  { test: /invalid otp/i, message: "驗證碼錯誤或已過期" },
  { test: /rate limit|too many requests|once every \d+ seconds/i, message: "操作太頻繁，請稍後再試" },
  { test: /password.*(at least|least \d+)/i, message: "密碼長度不足" },
  { test: /same password|different from the old/i, message: "新密碼不可與舊密碼相同" },
  { test: /session missing|jwt expired|refresh token/i, message: "登入已過期，請重新登入" },
  { test: /duplicate key|unique constraint|23505/i, message: "資料已存在" },
  { test: /foreign key|violates.*constraint/i, message: "資料關聯錯誤，無法完成操作" },
  { test: /row-level security|permission denied|42501/i, message: "沒有權限執行此操作" },
  { test: /network|fetch failed|failed to fetch|ECONNREFUSED/i, message: "網路連線失敗，請稍後再試" },
  { test: /^HTTP \d{3}$/, message: DEFAULT_FALLBACK },
];

const CJK = /[\u3400-\u9fff\uff00-\uffef]/;

export function extractErrorMessage(error: unknown): string | null {
  if (error == null) return null;
  if (typeof error === "string") {
    const s = error.trim();
    return s || null;
  }
  if (error instanceof Error) {
    const s = error.message.trim();
    return s || null;
  }
  if (typeof error === "object" && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string") {
      const s = m.trim();
      return s || null;
    }
  }
  return null;
}

function mapEnglish(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.length > 100) return fallback;

  const exact = EXACT[trimmed];
  if (exact) return exact;

  for (const { test, message } of PATTERNS) {
    if (test.test(trimmed)) return message;
  }

  return fallback;
}

/**
 * 將 Supabase / API / Error 物件轉成簡短繁中，供 toast 或表單錯誤顯示。
 * 已是中文的訊息會保留；未知英文則回傳 fallback，避免整段英文技術訊息。
 */
export function toUserMessage(
  error: unknown,
  fallback: string = DEFAULT_FALLBACK,
): string {
  const raw =
    typeof error === "string" ? error.trim() : extractErrorMessage(error);
  if (!raw) return fallback;

  if (CJK.test(raw)) {
    const colon = raw.indexOf("：");
    if (colon > 0 && colon < raw.length - 1) {
      const suffix = raw.slice(colon + 1).trim();
      if (suffix && !CJK.test(suffix)) {
        return raw.slice(0, colon + 1) + mapEnglish(suffix, "請稍後再試");
      }
    }
    return raw.length > 80 ? `${raw.slice(0, 77)}…` : raw;
  }

  return mapEnglish(raw, fallback);
}
