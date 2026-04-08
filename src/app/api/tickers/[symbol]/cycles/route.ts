import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    const tickers = await sql`SELECT id FROM "Ticker" WHERE symbol = ${symbol.toUpperCase()}`;
    if (tickers.length === 0) {
      return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
    }

    const cycles = await sql`
      SELECT * FROM "WheelCycle"
      WHERE "tickerId" = ${tickers[0].id}
      ORDER BY "startedAt" DESC
    `;

    for (const cycle of cycles) {
      const contracts = await sql`
        SELECT * FROM "Contract"
        WHERE "cycleId" = ${cycle.id}
        ORDER BY "openedAt" DESC
      `;
      cycle.contracts = contracts;
    }

    return NextResponse.json(cycles);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
