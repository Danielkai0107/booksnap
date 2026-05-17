import { headers } from "next/headers";

/**
 * 產生 auth 信件裡 redirect 用的網站 origin（須為完整 https URL）。
 *
 * 上線請在 Vercel 設 `NEXT_PUBLIC_SITE_URL=https://booksnaplib.com`，
 * 避免少數請求沒有 Origin header 時信內連結變成相對路徑或舊 vercel 網域。
 */
export async function getSiteOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const h = await headers();
  const origin = h.get("origin")?.trim().replace(/\/$/, "");
  if (origin) return origin;

  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host.split(",")[0].trim()}`.replace(/\/$/, "");
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
