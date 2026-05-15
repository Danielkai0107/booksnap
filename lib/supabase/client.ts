import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Use this in client components.
 * Cookies are managed by @supabase/ssr automatically; the session is
 * shared with the server via cookies (NOT localStorage), so server
 * components and route handlers can read the same session.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createBrowserClient(url, key);
}
