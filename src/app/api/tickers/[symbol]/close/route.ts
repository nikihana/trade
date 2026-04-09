import { NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import { submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { isMarketHours } from "@/lib/utils";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upper = symbol.toUpperCase();

    const openContracts = await sql`
      SELECT c.*, wc.id as "wheelCycleId" FROM "Contract" c
      JOIN "WheelCycle" wc ON wc.id = c."cycleId"
      JOIN "Ticker" t ON t.id = wc."tickerId"
      WHERE t.symbol = ${upper} AND c.status IN ('OPEN', 'PENDING')
    `;

    if (openContracts.length === 0) {
      return NextResponse.json({ error: "No open contracts to close" }, { status: 400 });
    }

    const marketOpen = isMarketHours();
    const results = [];
    let allSucceeded = true;
    let totalRealizedPL = 0;

    for (const contract of openContracts) {
      try {
        const quote = await getOptionQuote(contract.symbol as string);
        const closeCost = Math.round(quote.midPrice * 100 * 100) / 100;
        const limitPrice = quote.askPrice > 0 ? quote.askPrice : quote.midPrice;
        const premium = Number(contract.premium);
        const netPL = Math.round((premium - closeCost) * 100) / 100;

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

        if (orderStatus === "rejected" || orderStatus === "canceled") {
          allSucceeded = false;
          results.push({ symbol: contract.symbol, error: `Order ${orderStatus}` });
          continue;
        }

        if (marketOpen && (orderStatus === "filled" || orderStatus === "partially_filled")) {
          // Filled immediately during market hours — mark CLOSED with P&L
          await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closePrice" = ${closeCost}, "closedReason" = 'MANUAL', "alpacaOrderId" = ${orderId} WHERE id = ${contract.id}`;
          totalRealizedPL += netPL;
        } else {
          // After hours or not yet filled — mark PENDING_CLOSE
          await sql`UPDATE "Contract" SET status = 'PENDING_CLOSE', "closePrice" = ${closeCost}, "closedReason" = 'MANUAL', "alpacaOrderId" = ${orderId} WHERE id = ${contract.id}`;
        }

        const statusLabel = marketOpen ? "CLOSED" : "PENDING_CLOSE (fills at market open 9:30 AM ET)";
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${upper}, ${`CLOSE: ${contract.symbol} | Cost: $${closeCost} | Net P&L: $${netPL.toFixed(2)} | ${statusLabel}`})`;

        results.push({
          symbol: contract.symbol,
          type: contract.type,
          strikePrice: contract.strikePrice,
          premium,
          closeCost,
          netPL,
          orderId,
          orderStatus,
          pendingClose: !marketOpen,
        });
      } catch (err) {
        allSucceeded = false;
        const errMsg = err instanceof Error ? err.message : "Failed to close";
        results.push({ symbol: contract.symbol, error: errMsg });
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'ERROR', ${upper}, ${`CLOSE FAILED: ${contract.symbol} — ${errMsg}`})`;
      }
    }

    // Update realized P&L on the wheel cycle
    if (totalRealizedPL !== 0) {
      const cycleId = openContracts[0].wheelCycleId;
      await sql`UPDATE "WheelCycle" SET "realizedPL" = "realizedPL" + ${totalRealizedPL} WHERE id = ${cycleId}`;
    }

    // Only deactivate ticker if ALL closes fully succeeded (not pending)
    if (allSucceeded && marketOpen) {
      await sql`UPDATE "Ticker" SET active = false WHERE symbol = ${upper}`;
      await sql`UPDATE "WheelCycle" SET "completedAt" = now() WHERE "tickerId" IN (SELECT id FROM "Ticker" WHERE symbol = ${upper}) AND "completedAt" IS NULL`;
    }

    return NextResponse.json({ closed: results, allSucceeded, pendingClose: !marketOpen });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

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
      WHERE t.symbol = ${upper} AND c.status IN ('OPEN', 'PENDING', 'PENDING_CLOSE')
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

    return NextResponse.json({ symbol: upper, contracts, marketOpen: isMarketHours() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
