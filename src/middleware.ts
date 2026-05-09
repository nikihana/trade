import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// UI / asset paths that need no auth: login page, PWA manifest.
const publicUiPaths = ["/login", "/manifest.json"];

// API paths the cron + audit + migrate flows hit without a NextAuth session.
// Each route still enforces its own auth (cron-secret or requireAdmin),
// so middleware just gets out of the way.
const publicApiPaths = [
  "/api/auth",
  "/api/bot/cron",
  "/api/bot/screen",
  "/api/bot/morning",
  "/api/admin/migrate",
  "/api/admin/audit-pnl",
  "/api/admin/verify-pnl",
];

function hasSessionToken(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get("authjs.session-token")?.value ||
      request.cookies.get("__Secure-authjs.session-token")?.value
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicUiPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // API routes: enforce auth via 401 JSON instead of HTML redirect.
  // Routes in publicApiPaths handle their own auth (cron secret or
  // requireAdmin) so middleware lets them through unconditionally.
  if (pathname.startsWith("/api/")) {
    if (publicApiPaths.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    if (!hasSessionToken(request)) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // UI route: redirect to /login if no session.
  if (!hasSessionToken(request)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
