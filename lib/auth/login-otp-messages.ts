import {
  extractErrorMessage,
  toUserMessage,
} from "@/lib/errors/user-message";

const RATE_LIMIT_MESSAGE = "驗證信寄送太頻繁，請稍後再試";

const SEND_FAILED_MESSAGE = "無法寄送驗證信，請稍後再試";

/** 登入／重寄 OTP 專用：頻率限制與一般失敗分開說明。 */
export function toLoginOtpSendMessage(error: unknown): string {
  const raw = extractErrorMessage(error);
  if (raw && isOtpRateLimited(raw)) {
    return RATE_LIMIT_MESSAGE;
  }
  return toUserMessage(error, SEND_FAILED_MESSAGE);
}

export function isOtpRateLimited(message: string): boolean {
  return /rate limit|too many requests|once every \d+ seconds|over_request_rate_limit|email rate limit/i.test(
    message,
  );
}
