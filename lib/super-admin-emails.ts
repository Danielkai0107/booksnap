import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Collect addresses that should receive operational mail (issue reports, etc.).
 *
 * 1. All `profiles.role = super_admin` users with a verified auth email.
 * 2. Plus optional `ISSUE_REPORT_TO` (comma-separated) for extra ops inboxes.
 */
export async function listSuperAdminRecipientEmails(): Promise<string[]> {
  const admin = createAdminClient();
  const emails = new Set<string>();

  const extra = process.env.ISSUE_REPORT_TO?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  extra?.forEach((e) => emails.add(e));

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "super_admin");
  if (error) {
    console.error("[super-admin-emails] profiles query failed", error);
  } else {
    for (const row of profiles ?? []) {
      const { data: userData, error: userErr } =
        await admin.auth.admin.getUserById(row.id as string);
      if (userErr) {
        console.warn(
          "[super-admin-emails] getUserById failed",
          row.id,
          userErr.message,
        );
        continue;
      }
      const email = userData.user?.email?.trim().toLowerCase();
      if (email) emails.add(email);
    }
  }

  return [...emails];
}
