import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, "weekOf", symbol, price, "suggestedStrike", premium, "premiumYield",
             "ivPercentile", "daysToEarnings", "openInterest", regime,
             COALESCE(status, 'proposed') as status,
             COALESCE("yieldRank", 1) as "yieldRank"
      FROM "Candidate"
      WHERE "weekOf" = (SELECT MAX("weekOf") FROM "Candidate")
      ORDER BY "yieldRank" ASC, "premiumYield" DESC
    `;

    const weekOf = rows.length > 0 ? rows[0].weekOf : null;
    const proposedCount = rows.filter((r) => r.status === "proposed").length;

    return NextResponse.json({ weekOf, candidates: rows, proposedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
