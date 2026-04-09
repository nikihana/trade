import { NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import { submitOptionOrder, getOptionQuote, getOrder } from "@/lib/alpaca";

/**
 * POST /api/tickers/[symbol]/close — Close all open contracts for this ticker
 * Only marks DB as closed AFTER verifying the order was accepted by Alpaca.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upper = symbol.toUpperCase();

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
    let allSucceeded = true;

    for (const contract of openContracts) {
      try {
        const quote = await getOptionQuote(contract.symbol as string);
        const closeCost = quote.midPrice * 100;
        const limitPrice = quote.askPrice > 0 ? quote.askPrice : quote.midPrice;

        // Submit buy-to-close order
        const order = await submitOptionOrder({
          symbol: contract.symbol as string,
          qty: 1,
          side: "buy",
          type: "limit",
          time_in_force: "gtc",
          limit_price: limitPrice,
        });

        const orderId = String(order.id || "");
        const orderStatus = String(order.status || "");

        // Verify the order was accepted (not rejected)
        if (orderStatus === "rejected" || orderStatus === "canceled") {
          allSucceeded = false;
          results.push({
            symbol: contract.symbol,
            error: `Order ${orderStatus}: ${order.status}`,
          });
          continue;
        }

        // Order accepted — mark DB as closed (status will be PENDING_CLOSE until filled)
        await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closePrice" = ${closeCost}, "closedReason" = 'MANUAL', "alpacaOrderId" = ${orderId} WHERE id = ${contract.id}`;
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${upper}, ${`MANUAL CLOSE: ${contract.symbol} | Buy-to-close @ $${limitPrice.toFixed(2)} (${orderStatus}) | Order: ${orderId}`})`;

        results.push({
          symbol: contract.symbol,
          type: contract.type,
          strikePrice: contract.strikePrice,
          closeCost,
          orderId,
          orderStatus,
        });
      } catch (err) {
        allSucceeded = false;
        const errMsg = err instanceof Error ? err.message : "Failed to close";
        results.push({ symbol: contract.symbol, error: errMsg });
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'ERROR', ${upper}, ${`CLOSE FAILED: ${contract.symbol} — ${errMsg}`})`;
      }
    }

    // Only deactivate ticker if ALL closes succeeded
    if (allSucceeded) {
      await sql`UPDATE "Ticker" SET active = false WHERE symbol = ${upper}`;
      await sql`UPDATE "WheelCycle" SET "completedAt" = now() WHERE "tickerId" IN (SELECT id FROM "Ticker" WHERE symbol = ${upper}) AND "completedAt" IS NULL`;
    }

    return NextResponse.json({ closed: results, allSucceeded });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tickers/[symbol]/close — Preview what would be closed
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
