import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { OrganizationRow, ProfileRow } from "./supabase/types";

export type SessionContext = {
  userId: string;
  email: string | null;
  profile: ProfileRow;
  organization: OrganizationRow | null;
};

/**
 * Returns the current session context, or null if not authenticated.
 *
 * We use the **service-role** client to read `profiles` / `organizations`
 * by user_id, bypassing RLS — this is safe because we explicitly scope to
 * the authenticated user's id obtained from `auth.getUser()`. It also
 * avoids a chicken-and-egg situation where the user-bound client cannot
 * see its own profile before RLS context is fully bootstrapped.
 */
export async function getSession(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return {
      userId: user.id,
      email: user.email ?? null,
      profile: {
        id: user.id,
        organization_id: null,
        role: "unit",
        created_at: new Date().toISOString(),
      },
      organization: null,
    };
  }

  let organization: OrganizationRow | null = null;
  if (profile.organization_id) {
    const { data: org } = await admin
      .from("organizations")
      .select("*")
      .eq("id", profile.organization_id)
      .maybeSingle();
    organization = (org as OrganizationRow | null) ?? null;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile as ProfileRow,
    organization,
  };
}

/** Server-component guard: redirect to /login if no session. */
export async function requireUnitSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role === "super_admin") redirect("/super-admin");
  if (!session.organization) redirect("/login?error=no_org");
  if (session.organization.status !== "approved") {
    redirect(`/login?status=${session.organization.status}`);
  }
  return session;
}

/** Server-component guard: redirect to /super-admin/login if not super admin. */
export async function requireSuperAdmin(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/super-admin/login");
  if (session.profile.role !== "super_admin") redirect("/super-admin/login");
  return session;
}
