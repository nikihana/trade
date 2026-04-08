import { NextRequest, NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import { getOptionQuote } from "@/lib/alpaca";
import { checkTickerApproved, checkAvgVolume } from "@/lib/guards";

export async function GET() {
  try {
    const tickers = await sql`
      SELECT t.id, t.symbol, t.active, t.allocation, t."strikePreference",
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
          SELECT id, type, "strikePrice", expiration, premium, status, symbol as "optionSymbol"
          FROM "Contract"
          WHERE "cycleId" = ${t.cycleId} AND status IN ('OPEN', 'PENDING')
          LIMIT 1
        `;
        if (contracts[0]) {
          const c = contracts[0];
          let buybackCost = 0;
          try {
            const q = await getOptionQuote(c.optionSymbol as string);
            buybackCost = Math.round(q.midPrice * 100 * 100) / 100;
          } catch { /* skip */ }
          openContract = {
            type: c.type,
            strikePrice: c.strikePrice,
            expiration: c.expiration,
            premium: Number(c.premium),
            status: c.status,
            buybackCost,
          };
        }
      }

      const premium = openContract ? openContract.premium : 0;
      const buyback = openContract ? openContract.buybackCost : 0;

      result.push({
        id: t.id,
        symbol: t.symbol,
        active: t.active,
        allocation: Number(t.allocation) || 0,
        strikePreference: t.strikePreference || "10pct-otm",
        stage: t.stage || null,
        totalPremium: Number(t.totalPremium) || 0,
        costBasis: t.costBasis ? Number(t.costBasis) : null,
        sharesHeld: Number(t.sharesHeld) || 0,
        openContract,
        cycleId: t.cycleId || null,
        livePL: premium > 0 ? Math.round((premium - buyback) * 100) / 100 : null,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { symbol, allocation, strikePreference } = await request.json();
    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const alloc = Number(allocation) || 0;
    if (alloc <= 0) {
      return NextResponse.json({ error: "Allocation must be greater than 0" }, { status: 400 });
    }

    const strikePref = strikePreference || "10pct-otm";
    const upperSymbol = symbol.toUpperCase().trim();

    const approvedCheck = await checkTickerApproved(upperSymbol);
    if (!approvedCheck.allowed) {
      return NextResponse.json({ error: approvedCheck.reason }, { status: 400 });
    }

    const volumeCheck = await checkAvgVolume(upperSymbol);
    if (!volumeCheck.allowed) {
      return NextResponse.json({ error: volumeCheck.reason }, { status: 400 });
    }

    const existing = await sql`SELECT id, active FROM "Ticker" WHERE symbol = ${upperSymbol}`;

    if (existing.length > 0) {
      const ticker = existing[0];
      await sql`UPDATE "Ticker" SET active = true, allocation = ${alloc}, "strikePreference" = ${strikePref} WHERE id = ${ticker.id}`;
      const activeCycle = await sql`SELECT id FROM "WheelCycle" WHERE "tickerId" = ${ticker.id} AND "completedAt" IS NULL`;
      if (activeCycle.length === 0) {
        await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${genId()}, ${ticker.id}, 'SELLING_PUTS', 0, 0, 0)`;
      }
      return NextResponse.json({ id: ticker.id, symbol: upperSymbol });
    }

    const tickerId = genId();
    const cycleId = genId();
    await sql`INSERT INTO "Ticker" (id, symbol, active, allocation, "strikePreference") VALUES (${tickerId}, ${upperSymbol}, true, ${alloc}, ${strikePref})`;
    await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${cycleId}, ${tickerId}, 'SELLING_PUTS', 0, 0, 0)`;

    return NextResponse.json({ id: tickerId, symbol: upperSymbol });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
