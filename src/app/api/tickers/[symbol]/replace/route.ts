import { NextRequest, NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import { cancelOrder, getOrders, submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { findBestPut } from "@/lib/options";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upper = symbol.toUpperCase();
    const body = await request.json().catch(() => ({}));
    const overridePrice = body.price ? Number(body.price) : undefined;
    const overrideStrikePref = body.strikePreference as string | undefined;

    // 1. Find the pending contract in DB
    const pendingContracts = await sql`
      SELECT c.*, wc.id as "wheelCycleId", t."strikePreference"
      FROM "Contract" c
      JOIN "WheelCycle" wc ON wc.id = c."cycleId"
      JOIN "Ticker" t ON t.id = wc."tickerId"
      WHERE t.symbol = ${upper} AND c.status = 'PENDING'
      ORDER BY c."openedAt" DESC
      LIMIT 1
    `;

    if (pendingContracts.length === 0) {
      return NextResponse.json({ error: `No pending order found for ${upper}` }, { status: 404 });
    }

    const pending = pendingContracts[0];
    const cycleId = pending.cycleId as string;
    const oldSymbol = pending.symbol as string;
    const oldStrike = Number(pending.strikePrice);

    // 2. Cancel the Alpaca order
    let cancelledAlpaca = false;
    if (pending.alpacaOrderId) {
      try {
        await cancelOrder(pending.alpacaOrderId as string);
        cancelledAlpaca = true;
      } catch (e) {
        // Order may already be filled or cancelled — try cancelling by searching open orders
        const openOrders = await getOrders("open", 100);
        const match = (openOrders as { id: string; symbol: string }[]).find(
          (o) => o.symbol === oldSymbol
        );
        if (match) {
          await cancelOrder(match.id);
          cancelledAlpaca = true;
        }
      }
    } else {
      // No alpaca order ID — try finding by symbol in open orders
      const openOrders = await getOrders("open", 100);
      const match = (openOrders as { id: string; symbol: string }[]).find(
        (o) => o.symbol === oldSymbol
      );
      if (match) {
        await cancelOrder(match.id);
        cancelledAlpaca = true;
      }
    }

    // 3. Mark old contract as cancelled in DB
    await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closedReason" = 'REPLACED' WHERE id = ${pending.id}`;
    await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${upper}, ${`CANCELLED: ${oldSymbol} (strike $${oldStrike}) — replacing with new order`})`;

    // 4. Find new put contract
    const strikePref = overrideStrikePref || (pending.strikePreference as string) || "30-delta";
    const put = await findBestPut(upper, strikePref);
    if (!put) {
      return NextResponse.json({
        cancelled: { symbol: oldSymbol, strike: oldStrike, cancelledAlpaca },
        error: `Cancelled old order but no new put contract found for ${upper}`,
      }, { status: 404 });
    }

    // 5. Get premium quote
    const q = await getOptionQuote(put.symbol);
    const premium = q.midPrice * 100;
    if (premium <= 0) {
      return NextResponse.json({
        cancelled: { symbol: oldSymbol, strike: oldStrike, cancelledAlpaca },
        error: `Cancelled old order but new contract ${put.symbol} has no premium`,
      }, { status: 400 });
    }

    // 6. Submit new order
    const limitPrice = q.bidPrice > 0 ? q.bidPrice : q.midPrice;
    const order = await submitOptionOrder({
      symbol: put.symbol,
      qty: 1,
      side: "sell",
      type: "limit",
      time_in_force: "gtc",
      limit_price: limitPrice,
    });

    // 7. Insert new contract
    await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId") VALUES (${genId()}, ${cycleId}, 'PUT', 'SELL_TO_OPEN', ${put.symbol}, ${put.strikePrice}, ${new Date(put.expirationDate)}, ${premium}, 1, 'PENDING', ${String(order.id || '')})`;
    await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${upper}, ${`REPLACED: New order ${put.symbol} | Strike: $${put.strikePrice} | Premium: $${premium.toFixed(2)} | Limit: $${limitPrice.toFixed(2)} GTC`})`;

    return NextResponse.json({
      cancelled: { symbol: oldSymbol, strike: oldStrike, cancelledAlpaca },
      newOrder: {
        symbol: put.symbol,
        strikePrice: put.strikePrice,
        expiration: put.expirationDate,
        premium: Math.round(premium * 100) / 100,
        limitPrice: Math.round(limitPrice * 100) / 100,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
