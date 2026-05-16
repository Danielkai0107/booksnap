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
 *      - unit user visiting /super-admin → /admin
 *      - already-logged-in users visiting /login or /register → /admin
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
    pathname === "/favicon.ico"
  );
}

function isOpenAccessPath(pathname: string): boolean {
  // Public reader routes — no auth required, no role-based redirect.
  return pathname.startsWith("/o/") || pathname.startsWith("/api/public/");
}

function isSuperAdminPath(pathname: string): boolean {
  return pathname === "/super-admin" || pathname.startsWith("/super-admin/");
}

function isSuperAdminLoginPath(pathname: string): boolean {
  return pathname === SUPER_ADMIN_LOGIN || pathname.startsWith(`${SUPER_ADMIN_LOGIN}/`);
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

  // --- Public reader entry points (`/o/{slug}/*`, `/api/public/*`) ---------
  // These must be reachable without a session and never get redirected based
  // on role, otherwise QR-code flows for non-logged-in readers would break.
  if (isOpenAccessPath(pathname)) {
    return response;
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
      url.pathname = role === "super_admin" ? "/super-admin" : "/admin";
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
