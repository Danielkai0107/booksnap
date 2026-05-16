/**
 * Tiny per-process IP rate limiter for public API routes.
 *
 * Constraints we deliberately accept:
 *  - State is in-memory, so cold starts (or multi-instance deploys) reset it.
 *    For a small library tool this is fine; the goal is to slow down trivial
 *    scripted abuse, not enforce SLAs.
 *  - Buckets are per `(route, ip)` so a noisy reader can't lock out the
 *    whole org.
 *
 * Returns `{ ok: true }` when allowed; `{ ok: false, retryAfterMs }` when
 * the bucket is empty. Callers should respond with HTTP 429 in the latter
 * case so the client can back off.
 */
type Bucket = {
  tokens: number;
  /** Last time tokens were refilled, in epoch ms. */
  updatedAt: number;
};

type LimiterOptions = {
  /** Max burst the bucket can hold. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
};

const stores = new Map<string, Map<string, Bucket>>();

function getStore(name: string): Map<string, Bucket> {
  let s = stores.get(name);
  if (!s) {
    s = new Map();
    stores.set(name, s);
  }
  return s;
}

export function allowRequest(
  routeName: string,
  ip: string,
  opts: LimiterOptions
): { ok: true } | { ok: false; retryAfterMs: number } {
  const store = getStore(routeName);
  const now = Date.now();
  const existing = store.get(ip);
  if (!existing) {
    store.set(ip, { tokens: opts.capacity - 1, updatedAt: now });
    return { ok: true };
  }
  const elapsedSec = (now - existing.updatedAt) / 1000;
  const refilled = Math.min(
    opts.capacity,
    existing.tokens + elapsedSec * opts.refillPerSec
  );
  if (refilled < 1) {
    // Not enough to spend; tell the caller when they can try again.
    const need = 1 - refilled;
    const retryAfterMs = Math.ceil((need / opts.refillPerSec) * 1000);
    existing.tokens = refilled;
    existing.updatedAt = now;
    return { ok: false, retryAfterMs };
  }
  existing.tokens = refilled - 1;
  existing.updatedAt = now;
  return { ok: true };
}

/**
 * Extract a best-effort client IP from forwarded headers. Falls back to a
 * stable "unknown" bucket so callers don't accidentally share state when
 * the upstream proxy strips IP entirely.
 */
export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  return "unknown";
}
