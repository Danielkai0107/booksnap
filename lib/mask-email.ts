/** Masks an email for display, e.g. `user@example.com` → `use***@example.com`. */
export function maskEmailForDisplay(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visibleLen = Math.min(3, local.length);
  const visible = local.slice(0, visibleLen);

  return `${visible}***@${domain}`;
}
