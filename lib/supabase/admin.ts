import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Service-role Supabase client. **Server-only.** Bypasses RLS.
 *
 * Use ONLY inside server actions / route handlers that need cross-tenant
 * operations:
 *  - register (create auth user + organization + profile)
 *  - super-admin actions (approve / reject / suspend / reset password)
 *
 * NEVER import this from a client component.
 */
export function createAdminClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local (server-only)."
    );
  }
  _client = createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _client;
}
