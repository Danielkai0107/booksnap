import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Convert a free-form unit name (e.g. "新店北新國小 203 班") into a URL-safe
 * slug stem. Non-ASCII characters are stripped, so most Chinese names will
 * collapse to an empty stem; in that case we fall back to "org".
 */
function slugifyStem(input: string): string {
  const ascii = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return ascii || "org";
}

function randomSuffix(len = 5): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Generate a unique `public_slug` for a new organization. Tries a stem +
 * suffix combo and grows the suffix length on collision. Caller is expected
 * to be in a server context (uses the service-role admin client).
 */
export async function generateUniqueOrgSlug(name: string): Promise<string> {
  const admin = createAdminClient();
  const stem = slugifyStem(name);

  for (let suffixLen = 5; suffixLen <= 8; suffixLen++) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = `${stem}-${randomSuffix(suffixLen)}`;
      const { data, error } = await admin
        .from("organizations")
        .select("id")
        .eq("public_slug", candidate)
        .maybeSingle();
      if (error) throw error;
      if (!data) return candidate;
    }
  }
  throw new Error("Failed to allocate unique organization slug");
}
