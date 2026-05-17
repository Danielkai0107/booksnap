import {
  extractErrorMessage,
  toUserMessage,
} from "@/lib/errors/user-message";

const RATE_LIMIT_MESSAGE = "驗證信寄送太頻繁，請稍後再試";

const SEND_FAILED_MESSAGE = "無法寄送驗證信，請稍後再試";

type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
};

/** 登入／重寄 OTP 專用：頻率限制與一般失敗分開說明。 */
export function toLoginOtpSendMessage(error: unknown): string {
  if (isOtpRateLimitedError(error)) {
    return RATE_LIMIT_MESSAGE;
  }
  return toUserMessage(error, SEND_FAILED_MESSAGE);
}

export function isOtpRateLimitedError(error: unknown): boolean {
  if (error == null) return false;

  if (typeof error === "object") {
    const e = error as AuthErrorLike;
    if (e.status === 429) return true;
    const code = (e.code ?? "").toLowerCase();
    if (
      code.includes("rate_limit") ||
      code.includes("over_email") ||
      code === "429"
    ) {
      return true;
    }
  }

  const raw = extractErrorMessage(error);
  return raw ? isOtpRateLimitedMessage(raw) : false;
}

export function isOtpRateLimitedMessage(message: string): boolean {
  return /rate limit|too many requests|once every \d+ seconds|over_request_rate_limit|over_email|email rate limit|security purposes|429|too often|frequency|請求過於頻繁/i.test(
    message,
  );
}
