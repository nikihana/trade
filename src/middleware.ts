import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth && !req.nextUrl.pathname.startsWith("/login") && !req.nextUrl.pathname.startsWith("/setup") && !req.nextUrl.pathname.startsWith("/api/auth")) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
