import { NextRequest, NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";

export async function GET() {
  try {
    const tickers = await sql`
      SELECT t.id, t.symbol, t.active,
        wc.id as "cycleId", wc.stage, wc."totalPremium", wc."costBasis", wc."sharesHeld"
      FROM "Ticker" t
      LEFT JOIN "WheelCycle" wc ON wc."tickerId" = t.id AND wc."completedAt" IS NULL
      WHERE t.active = true
      ORDER BY t."createdAt" ASC
    `;

    const result = [];
    for (const t of tickers) {
      let openContract = null;
      if (t.cycleId) {
        const contracts = await sql`
          SELECT type, "strikePrice", expiration, premium, status
          FROM "Contract"
          WHERE "cycleId" = ${t.cycleId} AND status IN ('OPEN', 'PENDING')
          LIMIT 1
        `;
        openContract = contracts[0] || null;
      }

      result.push({
        id: t.id,
        symbol: t.symbol,
        active: t.active,
        stage: t.stage || null,
        totalPremium: Number(t.totalPremium) || 0,
        costBasis: t.costBasis ? Number(t.costBasis) : null,
        sharesHeld: Number(t.sharesHeld) || 0,
        openContract,
        cycleId: t.cycleId || null,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { symbol } = await request.json();
    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase().trim();

    const existing = await sql`SELECT id, active FROM "Ticker" WHERE symbol = ${upperSymbol}`;

    if (existing.length > 0) {
      const ticker = existing[0];
      if (!ticker.active) {
        await sql`UPDATE "Ticker" SET active = true WHERE id = ${ticker.id}`;
      }
      const activeCycle = await sql`SELECT id FROM "WheelCycle" WHERE "tickerId" = ${ticker.id} AND "completedAt" IS NULL`;
      if (activeCycle.length === 0) {
        await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${genId()}, ${ticker.id}, 'SELLING_PUTS', 0, 0, 0)`;
      }
      return NextResponse.json({ id: ticker.id, symbol: upperSymbol });
    }

    const tickerId = genId();
    const cycleId = genId();
    await sql`INSERT INTO "Ticker" (id, symbol, active) VALUES (${tickerId}, ${upperSymbol}, true)`;
    await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${cycleId}, ${tickerId}, 'SELLING_PUTS', 0, 0, 0)`;

    return NextResponse.json({ id: tickerId, symbol: upperSymbol });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
