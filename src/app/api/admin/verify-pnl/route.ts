import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * POST /api/admin/verify-pnl
 * Flips the realized_pl_verified flag to 'true' once the operator has reviewed
 * the audit. Admin-only.
 */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    await sql`UPDATE "Config" SET value = 'true' WHERE key = 'realized_pl_verified'`;
    return NextResponse.json({ success: true, verified: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
