import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 "Proxy" (formerly Middleware).
 *
 * Responsibilities:
 *   1. Refresh Supabase session cookies on every request.
 *   2. Optimistic route guard:
 *      - unauthenticated visitors of admin pages → /login
 *      - unauthenticated visitors of /super-admin → /super-admin/login
 *      - super-admin visiting unit pages → /super-admin
 *      - unit user visiting /super-admin → /
 *      - already-logged-in users visiting /login or /register → /
 *      - `/o/{slug}/*` and `/api/public/*` are always public (no session checks)
 *
 * Real authorization is still enforced by Postgres RLS for admin routes,
 * and by service-role + slug→org scoping for `/api/public/*`.
 */

const SUPER_ADMIN_LOGIN = "/super-admin/login";
const UNIT_LOGIN = "/login";

function isPublicUnitPath(pathname: string): boolean {
  return (
    pathname === UNIT_LOGIN ||
    pathname.startsWith("/register") ||
    pathname === "/forgot-password" ||
    pathname === "/favicon.ico"
  );
}

function isOpenAccessPath(pathname: string): boolean {
  // Routes that must work regardless of auth state, with no role-based
  // redirects. `/auth/callback` lands users (still unauthenticated) from
  // recovery / signup emails. `/reset-password` (password step) and
  // `/reset-password/verify` (OTP step) must both bypass auth gating.
  return (
    pathname.startsWith("/o/") ||
    pathname.startsWith("/api/public/") ||
    pathname === "/auth/callback" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/reset-password/") ||
    pathname === "/super-admin/reset-password" ||
    pathname.startsWith("/super-admin/reset-password/")
  );
}

function isSuperAdminPath(pathname: string): boolean {
  return pathname === "/super-admin" || pathname.startsWith("/super-admin/");
}

function isSuperAdminLoginPath(pathname: string): boolean {
  return (
    pathname === SUPER_ADMIN_LOGIN ||
    pathname.startsWith(`${SUPER_ADMIN_LOGIN}/`) ||
    pathname === "/super-admin/forgot-password"
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.app_metadata?.role as "unit" | "super_admin" | undefined) ?? null;
  const { pathname, search } = request.nextUrl;

  // --- MFA gate -------------------------------------------------------------
  // If the user has any verified TOTP factor we leave them at AAL1 right
  // after `signInWithPassword`. Until they verify on `/login/verify` (or the
  // super-admin twin) we only let them touch:
  //   - the verify page itself,
  //   - shared sign-out flows under `/auth/*`,
  //   - public `/o/*` and `/api/public/*` (handled by the open-access check
  //     above, not reachable here).
  // Everything else gets bounced to verify so the user can't sneak past MFA.
  let needsMfa = false;
  let mfaPath: "/login/verify" | "/super-admin/login/verify" = "/login/verify";
  if (user) {
    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    needsMfa =
      aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";
    mfaPath =
      role === "super_admin" ? "/super-admin/login/verify" : "/login/verify";
  }

  // --- Public reader entry points (`/o/{slug}/*`, `/api/public/*`) ---------
  // These must be reachable without a session and never get redirected based
  // on role, otherwise QR-code flows for non-logged-in readers would break.
  if (isOpenAccessPath(pathname)) {
    return response;
  }

  if (needsMfa) {
    if (pathname === mfaPath) return response;
    if (pathname.startsWith("/auth/")) return response;
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "mfa_required" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = mfaPath;
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // --- /super-admin/* paths -------------------------------------------------
  if (isSuperAdminPath(pathname)) {
    if (isSuperAdminLoginPath(pathname)) {
      // already a super admin → skip the login page
      if (role === "super_admin") {
        const url = request.nextUrl.clone();
        url.pathname = "/super-admin";
        url.search = "";
        return NextResponse.redirect(url);
      }
      return response;
    }
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = SUPER_ADMIN_LOGIN;
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (role !== "super_admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // --- Public unit-side pages (login / register) ---------------------------
  if (isPublicUnitPath(pathname)) {
    if (user) {
      const url = request.nextUrl.clone();
      url.pathname = role === "super_admin" ? "/super-admin" : "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // --- Everything else requires an authenticated UNIT user -----------------
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = UNIT_LOGIN;
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (role === "super_admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/super-admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  /**
   * Run on everything except:
   *  - _next internals
   *  - static asset extensions
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)",
  ],
};
