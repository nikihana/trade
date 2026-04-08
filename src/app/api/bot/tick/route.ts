import { NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import { getAccount, getPositions, submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { findBestPut, findBestCall } from "@/lib/options";

export async function POST() {
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(`[tick] ${msg}`); };

  try {
    const alpacaPositions = await getPositions();
    const stockPositions = new Map(
      alpacaPositions.filter((p) => !p.symbol.includes(" ")).map((p) => [p.symbol, p])
    );

    // Get active cycles with their tickers and open contracts
    const activeCycles = await sql`
      SELECT wc.*, t.symbol
      FROM "WheelCycle" wc
      JOIN "Ticker" t ON t.id = wc."tickerId"
      WHERE wc."completedAt" IS NULL
    `;

    for (const cycle of activeCycles) {
      const openContracts = await sql`
        SELECT * FROM "Contract" WHERE "cycleId" = ${cycle.id} AND status IN ('OPEN', 'PENDING')
      `;
      const symbol = cycle.symbol as string;
      const position = stockPositions.get(symbol);
      const hasShares = position && position.qty >= 100;

      // Check 50% profit on open contracts
      for (const contract of openContracts) {
        try {
          const quote = await getOptionQuote(contract.symbol as string);
          if (quote.midPrice <= 0) continue;
          const currentCost = quote.midPrice * 100;
          const profitPct = ((Number(contract.premium) - currentCost) / Number(contract.premium)) * 100;
          if (profitPct >= 50) {
            log(`${symbol}: 50% profit hit on ${contract.type} (${profitPct.toFixed(0)}%), closing`);
            await submitOptionOrder({ symbol: contract.symbol as string, qty: 1, side: "buy", type: "market", time_in_force: "day" });
            await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closePrice" = ${currentCost}, "closedReason" = 'PROFIT_TARGET' WHERE id = ${contract.id}`;
          }
        } catch { /* skip */ }
      }

      // Detect assignment
      if (cycle.stage === "SELLING_PUTS" && hasShares) {
        log(`${symbol}: ASSIGNMENT DETECTED — now holding ${position.qty} shares`);
        await sql`UPDATE "Contract" SET status = 'ASSIGNED', "closedAt" = now(), "closedReason" = 'ASSIGNMENT' WHERE "cycleId" = ${cycle.id} AND type = 'PUT' AND status IN ('OPEN', 'PENDING')`;
        await sql`UPDATE "WheelCycle" SET stage = 'SELLING_CALLS', "costBasis" = ${position.avgEntryPrice}, "sharesHeld" = ${position.qty} WHERE id = ${cycle.id}`;
      }

      // Detect call-away
      if (cycle.stage === "SELLING_CALLS" && !hasShares && Number(cycle.sharesHeld) > 0) {
        log(`${symbol}: CALL-AWAY DETECTED — shares sold, completing cycle`);
        await sql`UPDATE "Contract" SET status = 'ASSIGNED', "closedAt" = now(), "closedReason" = 'ASSIGNMENT' WHERE "cycleId" = ${cycle.id} AND type = 'CALL' AND status IN ('OPEN', 'PENDING')`;
        const callContract = openContracts.find((c) => c.type === "CALL");
        const sellPrice = callContract ? Number(callContract.strikePrice) : 0;
        const realizedPL = sellPrice ? (sellPrice - Number(cycle.costBasis || 0)) * 100 + Number(cycle.totalPremium) : Number(cycle.totalPremium);
        await sql`UPDATE "WheelCycle" SET "completedAt" = now(), "sharesHeld" = 0, "realizedPL" = ${realizedPL} WHERE id = ${cycle.id}`;
        await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${genId()}, ${cycle.tickerId}, 'SELLING_PUTS', 0, 0, 0)`;
        log(`${symbol}: Cycle complete! P&L: $${realizedPL.toFixed(2)}`);
      }

      // Detect expired contracts
      await sql`UPDATE "Contract" SET status = 'EXPIRED', "closedAt" = now(), "closedReason" = 'EXPIRATION' WHERE "cycleId" = ${cycle.id} AND status = 'OPEN' AND expiration < now()`;
    }

    // Execute trades
    const tickers = await sql`SELECT t.*, wc.id as "cycleId", wc.stage, wc."costBasis", wc."totalPremium" FROM "Ticker" t LEFT JOIN "WheelCycle" wc ON wc."tickerId" = t.id AND wc."completedAt" IS NULL WHERE t.active = true`;
    const account = await getAccount();

    for (const ticker of tickers) {
      const symbol = ticker.symbol as string;
      let cycleId = ticker.cycleId as string | null;

      if (!cycleId) {
        cycleId = genId();
        await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${cycleId}, ${ticker.id}, 'SELLING_PUTS', 0, 0, 0)`;
        log(`${symbol}: Created new wheel cycle`);
      }

      // Check for open contracts
      const open = await sql`SELECT id, type FROM "Contract" WHERE "cycleId" = ${cycleId} AND status IN ('OPEN', 'PENDING')`;
      if (open.length > 0) {
        log(`${symbol}: Open ${open[0].type} contract exists, skipping`);
        continue;
      }

      const stage = ticker.stage as string || "SELLING_PUTS";

      if (stage === "SELLING_PUTS") {
        const put = await findBestPut(symbol);
        if (!put) { log(`${symbol}: No suitable put found`); continue; }
        const cashNeeded = put.strikePrice * 100;
        if (account.cash < cashNeeded) { log(`${symbol}: Not enough cash`); continue; }
        const quote = await getOptionQuote(put.symbol);
        const premium = quote.midPrice * 100;
        if (premium <= 0) { log(`${symbol}: No premium available`); continue; }

        log(`${symbol}: SELLING PUT ${put.symbol} strike=$${put.strikePrice} premium=$${premium.toFixed(2)}`);
        const order = await submitOptionOrder({ symbol: put.symbol, qty: 1, side: "sell", type: "market", time_in_force: "day" });

        await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId") VALUES (${genId()}, ${cycleId}, 'PUT', 'SELL_TO_OPEN', ${put.symbol}, ${put.strikePrice}, ${new Date(put.expirationDate)}, ${premium}, 1, 'OPEN', ${String(order.id || '')})`;
        await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${premium} WHERE id = ${cycleId}`;
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${symbol}, ${`SOLD PUT: ${put.symbol} | Strike: $${put.strikePrice} | Premium: $${premium.toFixed(2)} | Exp: ${put.expirationDate}`})`;
        account.cash -= cashNeeded;
      }

      if (stage === "SELLING_CALLS" && ticker.costBasis) {
        const call = await findBestCall(symbol, Number(ticker.costBasis));
        if (!call) { log(`${symbol}: No suitable call above cost basis`); continue; }
        const quote = await getOptionQuote(call.symbol);
        const premium = quote.midPrice * 100;
        if (premium <= 0) { log(`${symbol}: No premium available`); continue; }

        log(`${symbol}: SELLING CALL ${call.symbol} strike=$${call.strikePrice} premium=$${premium.toFixed(2)}`);
        const order = await submitOptionOrder({ symbol: call.symbol, qty: 1, side: "sell", type: "market", time_in_force: "day" });

        await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId") VALUES (${genId()}, ${cycleId}, 'CALL', 'SELL_TO_OPEN', ${call.symbol}, ${call.strikePrice}, ${new Date(call.expirationDate)}, ${premium}, 1, 'OPEN', ${String(order.id || '')})`;
        await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${premium} WHERE id = ${cycleId}`;
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${symbol}, ${`SOLD CALL: ${call.symbol} | Strike: $${call.strikePrice} | Premium: $${premium.toFixed(2)} | Exp: ${call.expirationDate}`})`;
      }
    }

    log("Tick complete");
    return NextResponse.json({ success: true, logs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR: ${msg}`);
    return NextResponse.json({ success: false, logs, error: msg }, { status: 500 });
  }
}
