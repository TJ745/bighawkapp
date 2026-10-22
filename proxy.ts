import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Fast cookie-presence check at the edge. Real authentication and permission
// checks happen server-side in layouts, pages and Server Actions.

/**
 * Reachable without a session. Password reset has to be, by definition: the whole point is that
 * the person cannot sign in. The pages and actions behind these paths do their own checks.
 */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

/**
 * Public paths that a signed-in visitor is *not* bounced away from.
 *
 * Someone still signed in on one device may well be following a reset link because they have lost
 * the password on another, and sending them to the dashboard would make the link look broken.
 * Completing a reset signs every session out anyway, so there is nothing to protect by refusing.
 */
const ALLOWED_WITH_SESSION = ["/reset-password"];

const matches = (paths: string[], pathname: string) => paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));
  const isPublic = matches(PUBLIC_PATHS, pathname);

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (hasSession && isPublic && !matches(ALLOWED_WITH_SESSION, pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
