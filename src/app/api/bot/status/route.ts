import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const countResult = await sql`SELECT count(*)::int as count FROM "Ticker" WHERE active = true`;

    return NextResponse.json({
      running: false,
      lastCheck: null,
      nextCheck: null,
      activeTickers: countResult[0].count,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
