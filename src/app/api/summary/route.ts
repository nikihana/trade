import { NextResponse } from "next/server";
import { getAccount } from "@/lib/alpaca";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const [account, activeCycles, allCycles, openContractsResult, recentTrades] = await Promise.all([
      getAccount(),
      sql`
        SELECT wc.*, t.symbol
        FROM "WheelCycle" wc
        JOIN "Ticker" t ON t.id = wc."tickerId"
        WHERE wc."completedAt" IS NULL
      `,
      sql`SELECT "totalPremium", "realizedPL" FROM "WheelCycle"`,
      sql`SELECT count(*)::int as count FROM "Contract" WHERE status IN ('OPEN', 'PENDING')`,
      sql`SELECT * FROM "TradeLog" WHERE level = 'TRADE' ORDER BY timestamp DESC LIMIT 20`,
    ]);

    // Get open contracts for active cycles
    const cyclesWithContracts = [];
    for (const c of activeCycles) {
      const contracts = await sql`SELECT * FROM "Contract" WHERE "cycleId" = ${c.id} AND status IN ('OPEN', 'PENDING') LIMIT 1`;
      cyclesWithContracts.push({
        symbol: c.symbol,
        stage: c.stage,
        totalPremium: Number(c.totalPremium),
        costBasis: c.costBasis ? Number(c.costBasis) : null,
        sharesHeld: Number(c.sharesHeld),
        openContract: contracts[0] || null,
      });
    }

    return NextResponse.json({
      account,
      activeCycles: cyclesWithContracts,
      totals: {
        totalPremium: allCycles.reduce((s, c) => s + Number(c.totalPremium), 0),
        totalRealizedPL: allCycles.reduce((s, c) => s + Number(c.realizedPL), 0),
        openContracts: openContractsResult[0].count,
      },
      recentTrades,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
