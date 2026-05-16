/**
 * Client-side shape of a 402 quota response from `/api/recognize` or
 * `/api/books`. UI code uses `parseQuotaErrorResponse` to detect a quota
 * block so it can show the upgrade prompt instead of a generic toast.
 */
export type QuotaErrorPayload = {
  error: "ai_quota_exceeded" | "book_quota_exceeded";
  limit: number;
  used: number;
  plan: string;
  message: string;
  adding?: number;
};

export class QuotaExceededError extends Error {
  readonly kind: QuotaErrorPayload["error"];
  readonly payload: QuotaErrorPayload;
  constructor(payload: QuotaErrorPayload) {
    super(payload.message);
    this.name = "QuotaExceededError";
    this.kind = payload.error;
    this.payload = payload;
  }
}

export function isQuotaErrorPayload(value: unknown): value is QuotaErrorPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.error === "ai_quota_exceeded" || v.error === "book_quota_exceeded") &&
    typeof v.limit === "number" &&
    typeof v.used === "number" &&
    typeof v.plan === "string" &&
    typeof v.message === "string"
  );
}
