import { NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import { submitOptionOrder, getOptionQuote } from "@/lib/alpaca";

/**
 * POST /api/tickers/[symbol]/close — Close all open contracts for this ticker
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upper = symbol.toUpperCase();

    // Find all open contracts for this ticker
    const openContracts = await sql`
      SELECT c.* FROM "Contract" c
      JOIN "WheelCycle" wc ON wc.id = c."cycleId"
      JOIN "Ticker" t ON t.id = wc."tickerId"
      WHERE t.symbol = ${upper} AND c.status IN ('OPEN', 'PENDING')
    `;

    if (openContracts.length === 0) {
      return NextResponse.json({ error: "No open contracts to close" }, { status: 400 });
    }

    const results = [];

    for (const contract of openContracts) {
      try {
        // Get current quote for cost estimate
        const quote = await getOptionQuote(contract.symbol as string);
        const closeCost = quote.midPrice * 100;

        // Buy to close
        const order = await submitOptionOrder({
          symbol: contract.symbol as string,
          qty: 1,
          side: "buy",
          type: "market",
          time_in_force: "day",
        });

        // Update DB
        await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closePrice" = ${closeCost}, "closedReason" = 'MANUAL' WHERE id = ${contract.id}`;
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${upper}, ${`MANUAL CLOSE: ${contract.symbol} | Cost: $${closeCost.toFixed(2)}`})`;

        results.push({
          symbol: contract.symbol,
          type: contract.type,
          strikePrice: contract.strikePrice,
          closeCost,
          orderId: order.id,
        });
      } catch (err) {
        results.push({
          symbol: contract.symbol,
          error: err instanceof Error ? err.message : "Failed to close",
        });
      }
    }

    // Deactivate the ticker so it disappears from the dashboard
    await sql`UPDATE "Ticker" SET active = false WHERE symbol = ${upper}`;

    // Complete any open wheel cycles
    await sql`
      UPDATE "WheelCycle" SET "completedAt" = now()
      WHERE "tickerId" IN (SELECT id FROM "Ticker" WHERE symbol = ${upper})
      AND "completedAt" IS NULL
    `;

    return NextResponse.json({ closed: results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tickers/[symbol]/close — Preview what would be closed (for confirmation modal)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upper = symbol.toUpperCase();

    const openContracts = await sql`
      SELECT c.type, c.symbol, c."strikePrice", c.premium, c.expiration, c."spreadType"
      FROM "Contract" c
      JOIN "WheelCycle" wc ON wc.id = c."cycleId"
      JOIN "Ticker" t ON t.id = wc."tickerId"
      WHERE t.symbol = ${upper} AND c.status IN ('OPEN', 'PENDING')
    `;

    // Get current quotes for cost estimates
    const contracts = [];
    for (const c of openContracts) {
      let estimatedCost = 0;
      try {
        const q = await getOptionQuote(c.symbol as string);
        estimatedCost = q.midPrice * 100;
      } catch { /* skip */ }

      contracts.push({
        type: c.type,
        symbol: c.symbol,
        strikePrice: Number(c.strikePrice),
        premium: Number(c.premium),
        expiration: c.expiration,
        spreadType: c.spreadType,
        estimatedCost,
      });
    }

    return NextResponse.json({ symbol: upper, contracts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
