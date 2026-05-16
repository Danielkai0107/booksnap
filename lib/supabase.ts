/**
 * Backwards-compatible facade.
 *
 * Prefer importing from the new specific modules:
 *   - client components → `@/lib/supabase/client`
 *   - server (components / actions / route handlers) → `@/lib/supabase/server`
 *   - service-role (super admin / register) → `@/lib/supabase/admin`
 *
 * This file is kept so existing `import { supabase } from "@/lib/supabase"`
 * still works in **client components**. It will throw if accessed on the
 * server because the cookie-bound client lives in `./server` instead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";

export type {
  BookRow,
  ShelfRow,
  BorrowerRow,
  BorrowRecordRow,
  OrganizationRow,
  ProfileRow,
  ProfileRole,
  OrgStatus,
  CategoryRow,
} from "./supabase/types";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient();
  return _client;
}

// Proxy that defers client construction until first property access.
// Allows `import { supabase } from "@/lib/supabase"` to be evaluated during
// build/page-collection without env vars present.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
