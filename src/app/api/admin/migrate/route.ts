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

    // Back-fill yieldRank by premiumYield ordering within each weekOf.
    // Idempotent — running again over correctly-ranked rows keeps them correct.
    await sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY "weekOf" ORDER BY "premiumYield" DESC
        ) AS rn
        FROM "Candidate"
      )
      UPDATE "Candidate" c SET "yieldRank" = r.rn
      FROM ranked r
      WHERE c.id = r.id AND (c."yieldRank" IS NULL OR c."yieldRank" <> r.rn)
    `;

    return NextResponse.json({ success: true, message: "Migrations applied" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
