import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
