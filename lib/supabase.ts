import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (locally) or in your hosting provider's environment settings (e.g. Vercel)."
    );
  }
  _client = createClient(url, key);
  return _client;
}

// Proxy that defers client construction until first property access.
// Allows `import { supabase } from '@/lib/supabase'` to be evaluated during
// build/page-collection without env vars present.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type BookRow = {
  id: string;
  book_id: string;
  title: string;
  admin_name: string;
  checkin_time: string;
  image_url: string | null;
  status: "in" | "out" | string;
  shelf_id: string | null;
  return_time: string | null;
};

export type ShelfRow = {
  id: string;
  label: string | null;
};
