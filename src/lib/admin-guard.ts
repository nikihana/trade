import { NextResponse } from "next/server";
import { auth } from "./auth";

/**
 * Returns null if the caller is an admin. Otherwise returns a NextResponse
 * (401 if no session, 403 if not an admin) that the route should return immediately.
 *
 * Usage:
 *   const denied = await requireAdmin();
 *   if (denied) return denied;
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}
