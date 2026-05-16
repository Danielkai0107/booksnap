/**
 * Public-side QR payload helpers.
 *
 * The label QR encodes a full URL like `https://{host}/o/{slug}/b/{bookId}`.
 * Phone cameras open the URL in the browser; the public flow (borrow / return)
 * also reuses the same URL when the user scans through the in-app camera so
 * we keep a single canonical format. This module turns either an in-app QR
 * scan or a `?prefill=` query into a `(slug, bookId)` tuple, with sensible
 * fallbacks when readers paste a bare `LIB-...` code.
 */

export type ParsedScan = {
  slug: string | null;
  bookId: string;
};

const URL_RE = /\/o\/([^/?#]+)\/b\/([^/?#]+)/i;

export function parseScannedQr(raw: string, fallbackSlug?: string): ParsedScan | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = trimmed.match(URL_RE);
  if (m) {
    return {
      slug: decodeURIComponent(m[1]),
      bookId: decodeURIComponent(m[2]),
    };
  }
  // Bare code fallback (e.g. someone keys in `LIB-20260516-001` directly).
  // We can only attribute it to the current org if the caller passes one in.
  if (/^[A-Z0-9-]+$/i.test(trimmed)) {
    return { slug: fallbackSlug ?? null, bookId: trimmed.toUpperCase() };
  }
  return null;
}
