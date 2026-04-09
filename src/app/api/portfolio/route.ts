import { NextResponse } from "next/server";
import { getAccount, getPositions } from "@/lib/alpaca";
import { sql } from "@/lib/db";

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

    return NextResponse.json({ account, positions, totalPremium, totalRealizedPL });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
