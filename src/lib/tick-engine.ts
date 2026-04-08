import { sql, genId } from "./db";
import { getPositions, getLatestQuote, submitOptionOrder, getOptionQuote } from "./alpaca";
import { findBestPut, findBestCall } from "./options";
import { getConfig, getConfigNum } from "./config";
import { logTickSnapshot } from "./tick-snapshot";
import {
  checkMarketCondition,
  checkStopLoss,
  checkPremiumRichness,
  checkRiskCap,
  checkCallPremium,
} from "./guards";

/**
 * Shared tick engine — used by both /api/bot/tick and /api/bot/cron
 */
export async function runTickEngine(): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(`[tick] ${msg}`); };
  const logWarn = async (msg: string, ticker?: string, data?: Record<string, unknown>) => {
    log(`GUARD: ${msg}`);
    await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message, data) VALUES (${genId()}, now(), 'WARN', ${ticker || null}, ${msg}, ${data ? JSON.stringify(data) : null})`;
  };

  try {
    // ── Snapshot ──
    const account = await logTickSnapshot();
    log(`Snapshot: cash=$${account.cash.toFixed(0)} equity=$${account.equity.toFixed(0)}`);

    // ── Rule 8: Market condition check ──
    const marketCheck = await checkMarketCondition();
    if (!marketCheck.allowed) {
      log(`MARKET GUARD: ${marketCheck.reason}`);
      await sql`INSERT INTO "TradeLog" (id, timestamp, level, message, data) VALUES (${genId()}, now(), 'WARN', ${marketCheck.reason}, ${JSON.stringify(marketCheck.data || {})})`;
    }
    const marketOk = marketCheck.allowed;

    const profitTarget = await getConfigNum("profit_target_pct", 50);

    const alpacaPositions = await getPositions();
    const stockPositions = new Map(
      alpacaPositions.filter((p) => !p.symbol.includes(" ")).map((p) => [p.symbol, p])
    );

    // ── Monitor active cycles ──
    const activeCycles = await sql`
      SELECT wc.*, t.symbol FROM "WheelCycle" wc
      JOIN "Ticker" t ON t.id = wc."tickerId"
      WHERE wc."completedAt" IS NULL
    `;

    for (const cycle of activeCycles) {
      const openContracts = await sql`SELECT * FROM "Contract" WHERE "cycleId" = ${cycle.id} AND status IN ('OPEN', 'PENDING')`;
      const symbol = cycle.symbol as string;
      const position = stockPositions.get(symbol);
      const hasShares = position && position.qty >= 100;

      for (const contract of openContracts) {
        try {
          // ── Rule 3: Stop-loss check (before profit check) ──
          if (contract.type === "PUT") {
            const currentPrice = (await getLatestQuote(symbol)).lastPrice;
            const stopLoss = await checkStopLoss(currentPrice, Number(contract.strikePrice));
            if (!stopLoss.allowed) {
              log(`${symbol}: ${stopLoss.reason}`);
              const quote = await getOptionQuote(contract.symbol as string);
              const closeCost = quote.midPrice * 100;
              await submitOptionOrder({ symbol: contract.symbol as string, qty: 1, side: "buy", type: "market", time_in_force: "day" });
              await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closePrice" = ${closeCost}, "closedReason" = 'STOP_LOSS' WHERE id = ${contract.id}`;
              await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message, data) VALUES (${genId()}, now(), 'TRADE', ${symbol}, ${`STOP-LOSS: Closed ${contract.symbol} at $${closeCost.toFixed(2)}`}, ${JSON.stringify(stopLoss.data || {})})`;
              continue; // skip profit check
            }
          }

          // ── Rule 4: Profit target check ──
          const quote = await getOptionQuote(contract.symbol as string);
          if (quote.midPrice <= 0) continue;
          const currentCost = quote.midPrice * 100;
          const profitPct = ((Number(contract.premium) - currentCost) / Number(contract.premium)) * 100;
          if (profitPct >= profitTarget) {
            log(`${symbol}: ${profitTarget}% profit hit (${profitPct.toFixed(0)}%), closing`);
            await submitOptionOrder({ symbol: contract.symbol as string, qty: 1, side: "buy", type: "market", time_in_force: "day" });
            await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closePrice" = ${currentCost}, "closedReason" = 'PROFIT_TARGET' WHERE id = ${contract.id}`;
            await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${symbol}, ${`CLOSED at ${profitTarget}% profit: ${contract.symbol}`})`;
          }
        } catch { /* skip */ }
      }

      // Detect assignment
      if (cycle.stage === "SELLING_PUTS" && hasShares) {
        log(`${symbol}: ASSIGNMENT DETECTED`);
        await sql`UPDATE "Contract" SET status = 'ASSIGNED', "closedAt" = now(), "closedReason" = 'ASSIGNMENT' WHERE "cycleId" = ${cycle.id} AND type = 'PUT' AND status IN ('OPEN', 'PENDING')`;
        await sql`UPDATE "WheelCycle" SET stage = 'SELLING_CALLS', "costBasis" = ${position.avgEntryPrice}, "sharesHeld" = ${position.qty} WHERE id = ${cycle.id}`;
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${symbol}, ${`ASSIGNMENT: Now holding ${position.qty} shares @ $${position.avgEntryPrice}`})`;
      }

      // Detect call-away
      if (cycle.stage === "SELLING_CALLS" && !hasShares && Number(cycle.sharesHeld) > 0) {
        log(`${symbol}: CALL-AWAY DETECTED`);
        await sql`UPDATE "Contract" SET status = 'ASSIGNED', "closedAt" = now(), "closedReason" = 'ASSIGNMENT' WHERE "cycleId" = ${cycle.id} AND type = 'CALL' AND status IN ('OPEN', 'PENDING')`;
        const callContract = openContracts.find((c) => c.type === "CALL");
        const sellPrice = callContract ? Number(callContract.strikePrice) : 0;
        const realizedPL = sellPrice ? (sellPrice - Number(cycle.costBasis || 0)) * 100 + Number(cycle.totalPremium) : Number(cycle.totalPremium);
        await sql`UPDATE "WheelCycle" SET "completedAt" = now(), "sharesHeld" = 0, "realizedPL" = ${realizedPL} WHERE id = ${cycle.id}`;
        await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${genId()}, ${cycle.tickerId}, 'SELLING_PUTS', 0, 0, 0)`;
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${symbol}, ${`CYCLE COMPLETE: P&L $${realizedPL.toFixed(2)}`})`;
      }

      // Expire old contracts
      await sql`UPDATE "Contract" SET status = 'EXPIRED', "closedAt" = now(), "closedReason" = 'EXPIRATION' WHERE "cycleId" = ${cycle.id} AND status = 'OPEN' AND expiration < now()`;
    }

    // ── Execute new trades ──
    const tickers = await sql`SELECT t.*, wc.id as "cycleId", wc.stage, wc."costBasis", wc."totalPremium" FROM "Ticker" t LEFT JOIN "WheelCycle" wc ON wc."tickerId" = t.id AND wc."completedAt" IS NULL WHERE t.active = true`;
    let cashAvailable = account.cash;

    for (const ticker of tickers) {
      const symbol = ticker.symbol as string;
      let cycleId = ticker.cycleId as string | null;

      if (!cycleId) {
        cycleId = genId();
        await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${cycleId}, ${ticker.id}, 'SELLING_PUTS', 0, 0, 0)`;
        log(`${symbol}: New cycle`);
      }

      const open = await sql`SELECT id, type FROM "Contract" WHERE "cycleId" = ${cycleId} AND status IN ('OPEN', 'PENDING')`;
      if (open.length > 0) { log(`${symbol}: Open ${open[0].type}, skipping`); continue; }

      const stage = ticker.stage as string || "SELLING_PUTS";

      // ── SELLING PUTS ──
      if (stage === "SELLING_PUTS") {
        // Rule 8: Market gate
        if (!marketOk) {
          log(`${symbol}: Skipping put sale — market condition unfavorable`);
          continue;
        }

        const put = await findBestPut(symbol);
        if (!put) { log(`${symbol}: No put found`); continue; }
        if (cashAvailable < put.strikePrice * 100) { log(`${symbol}: Not enough cash`); continue; }
        const quote = await getOptionQuote(put.symbol);
        const premium = quote.midPrice * 100;
        if (premium <= 0) { log(`${symbol}: No premium`); continue; }

        // Rule 2: Premium richness (IV proxy)
        const premCheck = await checkPremiumRichness(premium, put.strikePrice);
        if (!premCheck.allowed) {
          await logWarn(premCheck.reason!, symbol, premCheck.data);
          continue;
        }

        // Rule 7: Risk cap
        const riskCheck = await checkRiskCap(put.strikePrice, account.equity, cashAvailable - put.strikePrice * 100);
        if (!riskCheck.allowed) {
          await logWarn(riskCheck.reason!, symbol, riskCheck.data);
          continue;
        }

        log(`${symbol}: SELL PUT ${put.symbol} $${put.strikePrice} prem=$${premium.toFixed(2)}`);
        const order = await submitOptionOrder({ symbol: put.symbol, qty: 1, side: "sell", type: "market", time_in_force: "day" });
        await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId") VALUES (${genId()}, ${cycleId}, 'PUT', 'SELL_TO_OPEN', ${put.symbol}, ${put.strikePrice}, ${new Date(put.expirationDate)}, ${premium}, 1, 'OPEN', ${String(order.id || '')})`;
        await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${premium} WHERE id = ${cycleId}`;
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${symbol}, ${`SOLD PUT: ${put.symbol} | Strike: $${put.strikePrice} | Premium: $${premium.toFixed(2)}`})`;
        cashAvailable -= put.strikePrice * 100;
      }

      // ── SELLING CALLS ──
      if (stage === "SELLING_CALLS" && ticker.costBasis) {
        const call = await findBestCall(symbol, Number(ticker.costBasis));
        if (!call) { log(`${symbol}: No call found`); continue; }
        const quote = await getOptionQuote(call.symbol);
        const premium = quote.midPrice * 100;
        if (premium <= 0) { log(`${symbol}: No premium`); continue; }

        // Rule 5: Minimum call premium
        const callCheck = await checkCallPremium(premium);
        if (!callCheck.allowed) {
          await logWarn(callCheck.reason!, symbol, callCheck.data);
          continue;
        }

        log(`${symbol}: SELL CALL ${call.symbol} $${call.strikePrice} prem=$${premium.toFixed(2)}`);
        const order = await submitOptionOrder({ symbol: call.symbol, qty: 1, side: "sell", type: "market", time_in_force: "day" });
        await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId") VALUES (${genId()}, ${cycleId}, 'CALL', 'SELL_TO_OPEN', ${call.symbol}, ${call.strikePrice}, ${new Date(call.expirationDate)}, ${premium}, 1, 'OPEN', ${String(order.id || '')})`;
        await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${premium} WHERE id = ${cycleId}`;
        await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message) VALUES (${genId()}, now(), 'TRADE', ${symbol}, ${`SOLD CALL: ${call.symbol} | Strike: $${call.strikePrice} | Premium: $${premium.toFixed(2)}`})`;
      }
    }

    log("Tick complete");

    const healthcheckUrl = await getConfig("healthcheck_url");
    if (healthcheckUrl) {
      try { await fetch(healthcheckUrl); } catch { /* ignore */ }
    }

    return { success: true, logs };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR: ${msg}`);

    const healthcheckUrl = await getConfig("healthcheck_url");
    if (healthcheckUrl) {
      try { await fetch(`${healthcheckUrl}/fail`); } catch { /* ignore */ }
    }

    return { success: false, logs };
  }
}
