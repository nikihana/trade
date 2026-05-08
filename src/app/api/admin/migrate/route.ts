import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * POST /api/admin/migrate
 * Run schema migrations. Safe to call multiple times (IF NOT EXISTS guards).
 */
export async function POST() {
  try {
    await sql`ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'proposed'`;
    await sql`ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "yieldRank" integer`;
    await sql`ALTER TABLE "Ticker" ADD COLUMN IF NOT EXISTS "flaggedForReview" boolean NOT NULL DEFAULT false`;

    // Back-fill yieldRank for any existing rows that don't have it
    await sql`
      UPDATE "Candidate" SET "yieldRank" = 1
      WHERE "yieldRank" IS NULL
    `;

    return NextResponse.json({ success: true, message: "Migrations applied" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
