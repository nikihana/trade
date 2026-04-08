import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const rows = await sql`
      SELECT * FROM "Candidate"
      WHERE "weekOf" = (SELECT MAX("weekOf") FROM "Candidate")
      ORDER BY "premiumYield" DESC
    `;

    const weekOf = rows.length > 0 ? rows[0].weekOf : null;

    return NextResponse.json({ weekOf, candidates: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
