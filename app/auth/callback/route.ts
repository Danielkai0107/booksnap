import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared PKCE callback for every Supabase email-link flow:
 *   - 忘記密碼 (recovery) → next=/reset-password (or /super-admin/reset-password)
 *   - 註冊 (signup confirmation) → next=/register/post-verify
 *
 * The link in Supabase's email lands here as `?code=<pkce>&next=<safe-path>`.
 * We exchange the code for a session (sets cookies) and bounce to `next`.
 *
 * If `code` is missing or exchange fails (link expired, already-used, tampered),
 * we redirect to the corresponding login page with `?error=invalid_link` so the
 * user gets a clear toast instead of a blank page.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/";

  // Only allow same-origin paths to prevent open redirects.
  const safeNext = rawNext.startsWith("/") ? rawNext : "/";
  const errorTarget = safeNext.startsWith("/super-admin")
    ? "/super-admin/login?error=invalid_link"
    : "/login?error=invalid_link";

  if (!code) {
    return NextResponse.redirect(new URL(errorTarget, url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed", error);
    return NextResponse.redirect(new URL(errorTarget, url));
  }

  return NextResponse.redirect(new URL(safeNext, url));
}
