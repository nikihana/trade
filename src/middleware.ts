import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public paths that don't require authentication
// "Public" here means "middleware does not redirect to /login". Routes still
// enforce their own auth/admin checks and return proper 401/403 JSON instead
// of bouncing API consumers through an HTML login redirect.
const publicPaths = ["/login", "/api/auth", "/api/bot/cron", "/api/bot/screen", "/api/bot/morning", "/api/config", "/api/admin/migrate", "/api/admin/audit-pnl", "/manifest.json"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for NextAuth session token cookie
  const token =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
