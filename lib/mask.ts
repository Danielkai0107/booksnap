/**
 * Mask helpers used in two flavours:
 *
 *   - `maskPhonePublic` — for the public catalog (`/o/{slug}/books`). Only
 *     the last 3 digits are revealed so anonymous readers can recognise
 *     "their" entry without doxxing the borrower.
 *   - `maskPhoneAdmin` — for the admin backend's preview sheets. Shows a
 *     bit more (full last 4) since the admin already has full access via
 *     the detail page; this version is meant to slow shoulder-surfing.
 *
 * Both functions tolerate empty input and short numbers gracefully so that
 * callers don't need to guard before formatting.
 */

function digitsOnly(input: string): string {
  return input.replace(/\D+/g, "");
}

export function maskPhonePublic(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = digitsOnly(phone);
  if (digits.length <= 3) return "***";
  const tail = digits.slice(-3);
  return `${"*".repeat(Math.max(digits.length - 3, 0))}${tail}`;
}

export function maskPhoneAdmin(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = digitsOnly(phone);
  if (digits.length <= 4) return digits.replace(/.(?=.{2})/g, "*");
  const head = digits.slice(0, 2);
  const tail = digits.slice(-4);
  const middle = "*".repeat(Math.max(digits.length - head.length - tail.length, 0));
  return `${head}${middle}${tail}`;
}
