"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOutLocal } from "@/lib/auth/sign-out";

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await signOutLocal(supabase);
  redirect("/login");
}
