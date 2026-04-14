import { NextResponse } from "next/server";
import { getAccount, getPositions } from "@/lib/alpaca";
import { sql } from "@/lib/db";

/** Parse strike price from OCC option symbol (e.g. AMD260424P00226000 → 226) */
function parseStrikeFromOCC(symbol: string): number {
  // OCC format: ROOT(variable) + YYMMDD(6) + P/C(1) + price*1000(8 digits)
  const match = symbol.match(/[A-Z]+(\d{6})[PC](\d{8})$/);
  if (!match) return 0;
  return parseInt(match[2], 10) / 1000;
}

export async function GET() {
  try {
    const [account, positions, activeCycles, allCycles] = await Promise.all([
      getAccount(),
      getPositions(),
      // Premium from open positions only
      sql`SELECT "totalPremium" FROM "WheelCycle" WHERE "completedAt" IS NULL`,
      // Realized P&L from all completed cycles
      sql`SELECT "realizedPL" FROM "WheelCycle" WHERE "completedAt" IS NOT NULL`,
    ]);

    const totalPremium = activeCycles.reduce((s, c) => s + Number(c.totalPremium), 0);
    const totalRealizedPL = allCycles.reduce((s, c) => s + Number(c.realizedPL), 0);

    // Deployed capital = sum of (strike × 100) for each short put confirmed by Alpaca
    const deployedCapital = positions
      .filter((p) => p.qty < 0 && p.symbol.match(/[A-Z]+\d{6}P\d{8}$/))
      .reduce((sum, p) => sum + parseStrikeFromOCC(p.symbol) * 100, 0);

    return NextResponse.json({ account, positions, totalPremium, totalRealizedPL, deployedCapital });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
