import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * ===========================================================
 * middleware.ts
 * -----------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Before this file, /admin/products was guarded only by
 * useAdminSession() - a useEffect inside a client component.
 * That runs AFTER React has mounted, so opening the URL
 * directly painted the whole admin panel for a moment before
 * redirecting. Anyone could screenshot it, and with JS
 * disabled the redirect never happened at all.
 *
 * This runs on the edge, before any admin HTML is generated.
 * No session marker -> 307 to /admin/login, and the admin page
 * is never rendered or sent.
 *
 * WHAT THIS IS NOT
 *
 * This is a UX gate, not the security boundary. The cookie it
 * checks only says "this browser completed an admin login".
 * The real boundary is AdminAuthFilter in the Spring backend,
 * which verifies a genuine Firebase ID token and re-checks the
 * ADMIN flag in PostgreSQL on EVERY /api/admin/** call.
 * Forging this cookie gets you an empty shell that can read
 * nothing, because every request it makes comes back 401/403.
 * ===========================================================
 */

export const ADMIN_SESSION_COOKIE = "namma_admin_session";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The login page itself must stay reachable, or nobody can ever get in.
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (hasSession) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/admin/login", request.url);
  // Remember where they were headed so login can send them back there.
  loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything under /admin, including /admin itself.
  matcher: ["/admin", "/admin/:path*"],
};
