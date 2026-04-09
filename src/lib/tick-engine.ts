import { sql, genId } from "./db";
import { getPositions, getLatestQuote, submitOptionOrder, getOptionQuote, getOrders } from "./alpaca";
import { findBestPut, findBestCall } from "./options";
import { getConfig, getConfigNum } from "./config";
import { logTickSnapshot } from "./tick-snapshot";
import { detectRegime } from "./regime";
import { findBullPutSpread, findBearCallSpread, findIronCondor, submitSpreadOrder, buySpyPutHedge } from "./spreads";
import { checkStopLoss, checkPremiumRichness, checkRiskCap, checkCallPremium } from "./guards";
import { MarketRegime, SpreadType } from "./types";

export async function runTickEngine(opts?: { override?: boolean }): Promise<{ success: boolean; logs: string[] }> {
  const override = opts?.override ?? false;
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(`[tick] ${msg}`); };
  const logDb = async (level: string, msg: string, ticker?: string, data?: Record<string, unknown>) => {
    await sql`INSERT INTO "TradeLog" (id, timestamp, level, ticker, message, data) VALUES (${genId()}, now(), ${level}, ${ticker || null}, ${msg}, ${data ? JSON.stringify(data) : null})`;
  };

  try {
    // ── 1. Snapshot ──
    const account = await logTickSnapshot();
    log(`Snapshot: cash=$${account.cash.toFixed(0)} equity=$${account.equity.toFixed(0)}`);
    if (override) log("⚠ OVERRIDE MODE — all guards bypassed");

    // ── 1b. Reconcile DB with Alpaca positions ──
    // Flag mismatches — if Alpaca holds a position our DB thinks is closed,
    // mark it as FAILED_CLOSE so it shows in Pending for manual resolution.
    const alpacaAllPositions = await getPositions();
    const alpacaShortOptions = alpacaAllPositions.filter((p) => p.qty < 0);

    for (const pos of alpacaShortOptions) {
      const dbContracts = await sql`
        SELECT c.id, c.status, t.symbol as ticker, t.active as "tickerActive"
        FROM "Contract" c
        JOIN "WheelCycle" wc ON wc.id = c."cycleId"
        JOIN "Ticker" t ON t.id = wc."tickerId"
        WHERE c.symbol = ${pos.symbol}
        ORDER BY c."openedAt" DESC LIMIT 1
      `;

      if (dbContracts.length === 0) continue;
      const db = dbContracts[0];

      // DB says closed but Alpaca still holds it — close FAILED
      // (PENDING_CLOSE is expected — that's an after-hours order waiting to fill)
      if (db.status !== "OPEN" && db.status !== "PENDING" && db.status !== "PENDING_CLOSE") {
        log(`RECONCILE: ${pos.symbol} marked ${db.status} in DB but Alpaca still holds it — marking FAILED_CLOSE`);
        await sql`UPDATE "Contract" SET status = 'OPEN', "closedAt" = null, "closePrice" = null, "closedReason" = 'FAILED_CLOSE' WHERE id = ${db.id}`;
        await logDb("ERROR", `CLOSE FAILED: ${pos.symbol} still open on Alpaca — needs manual resolution`, db.ticker as string);
      }

      // Reactivate ticker so it appears in dashboard (Pending section, since close failed)
      if (!db.tickerActive) {
        await sql`UPDATE "Ticker" SET active = true WHERE symbol = ${db.ticker}`;
        await sql`UPDATE "WheelCycle" SET "completedAt" = null WHERE "tickerId" IN (SELECT id FROM "Ticker" WHERE symbol = ${db.ticker})`;
        log(`RECONCILE: ${db.ticker} reactivated — position still open, needs attention`);
      }
    }

    // Check PENDING_CLOSE contracts — if Alpaca no longer holds them, they filled
    const alpacaSymbolSet = new Set(alpacaShortOptions.map((p) => p.symbol));
    const pendingCloses = await sql`SELECT c.id, c.symbol, c.premium, c."closePrice", c."cycleId" FROM "Contract" c WHERE c.status = 'PENDING_CLOSE'`;
    for (const c of pendingCloses) {
      if (!alpacaSymbolSet.has(c.symbol as string)) {
        const netPL = Number(c.premium) - Number(c.closePrice || 0);
        log(`RECONCILE: ${c.symbol} PENDING_CLOSE filled — P&L: $${netPL.toFixed(2)}`);
        await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now() WHERE id = ${c.id}`;
        await sql`UPDATE "WheelCycle" SET "realizedPL" = "realizedPL" + ${netPL}, "completedAt" = now() WHERE id = ${c.cycleId}`;
        await sql`UPDATE "Ticker" SET active = false WHERE id IN (SELECT "tickerId" FROM "WheelCycle" WHERE id = ${c.cycleId})`;
        await logDb("TRADE", `CLOSE FILLED: ${c.symbol} | P&L: $${netPL.toFixed(2)}`, undefined);
      }
    }

    // ── 2. Regime Detection (BEFORE any trades) ──
    const regime = await detectRegime();
    log(`REGIME: ${regime.regime} — ${regime.reason}`);
    await logDb("INFO", `REGIME: ${regime.regime} — ${regime.reason}`, undefined, regime as unknown as Record<string, unknown>);

    const profitTarget = await getConfigNum("profit_target_pct", 50);
    const cautiousSizePct = await getConfigNum("cautious_size_pct", 0.50);
    const defensiveMaxDte = await getConfigNum("defensive_max_dte", 14);

    const alpacaPositions = await getPositions();
    const stockPositions = new Map(
      alpacaPositions.filter((p) => !p.symbol.includes(" ")).map((p) => [p.symbol, p])
    );

    // ── 3. Monitor existing positions (ALWAYS — regardless of regime) ──
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
          // Stop-loss check (for PUTs)
          if (contract.type === "PUT" && !contract.spreadType) {
            const currentPrice = (await getLatestQuote(symbol)).lastPrice;
            const stopLoss = await checkStopLoss(currentPrice, Number(contract.strikePrice));
            if (!stopLoss.allowed) {
              log(`${symbol}: ${stopLoss.reason}`);
              const q = await getOptionQuote(contract.symbol as string);
              const closeCost = q.midPrice * 100;
              await submitOptionOrder({ symbol: contract.symbol as string, qty: 1, side: "buy", type: "limit", time_in_force: "gtc", limit_price: q.askPrice > 0 ? q.askPrice : q.midPrice });
              await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closePrice" = ${closeCost}, "closedReason" = 'STOP_LOSS' WHERE id = ${contract.id}`;
              await logDb("TRADE", `STOP-LOSS: Closed ${contract.symbol} at $${closeCost.toFixed(2)}`, symbol, stopLoss.data);
              continue;
            }
          }

          // Profit target check
          const q = await getOptionQuote(contract.symbol as string);
          if (q.midPrice <= 0) continue;
          const currentCost = q.midPrice * 100;
          const profitPct = ((Number(contract.premium) - currentCost) / Number(contract.premium)) * 100;
          if (profitPct >= profitTarget) {
            log(`${symbol}: ${profitTarget}% profit hit (${profitPct.toFixed(0)}%), closing`);
            await submitOptionOrder({ symbol: contract.symbol as string, qty: 1, side: "buy", type: "limit", time_in_force: "gtc", limit_price: q.askPrice > 0 ? q.askPrice : q.midPrice });
            await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closePrice" = ${currentCost}, "closedReason" = 'PROFIT_TARGET' WHERE id = ${contract.id}`;
            await logDb("TRADE", `CLOSED at ${profitTarget}% profit: ${contract.symbol}`, symbol);
          }
        } catch { /* skip */ }
      }

      // Detect assignment
      if (cycle.stage === "SELLING_PUTS" && hasShares) {
        log(`${symbol}: ASSIGNMENT DETECTED`);
        await sql`UPDATE "Contract" SET status = 'ASSIGNED', "closedAt" = now(), "closedReason" = 'ASSIGNMENT' WHERE "cycleId" = ${cycle.id} AND type = 'PUT' AND status IN ('OPEN', 'PENDING')`;
        await sql`UPDATE "WheelCycle" SET stage = 'SELLING_CALLS', "costBasis" = ${position.avgEntryPrice}, "sharesHeld" = ${position.qty} WHERE id = ${cycle.id}`;
        await logDb("TRADE", `ASSIGNMENT: Now holding ${position.qty} shares @ $${position.avgEntryPrice}`, symbol);
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
        await logDb("TRADE", `CYCLE COMPLETE: P&L $${realizedPL.toFixed(2)}`, symbol);
      }

      // Expire old contracts
      await sql`UPDATE "Contract" SET status = 'EXPIRED', "closedAt" = now(), "closedReason" = 'EXPIRATION' WHERE "cycleId" = ${cycle.id} AND status = 'OPEN' AND expiration < now()`;
    }

    // ── 4. Regime-Aware Trade Dispatcher ──
    if (regime.regime === MarketRegime.HALT && !override) {
      log("HALT regime: No new trades — VIX too high");
    } else {
      const tickers = await sql`SELECT t.*, wc.id as "cycleId", wc.stage, wc."costBasis", wc."totalPremium" FROM "Ticker" t LEFT JOIN "WheelCycle" wc ON wc."tickerId" = t.id AND wc."completedAt" IS NULL WHERE t.active = true`;
      let cashAvailable = Math.min(account.cash, account.optionsBuyingPower);

      // Get all open orders from Alpaca to prevent duplicates
      const alpacaOpenOrders = await getOrders("open", 100);
      const openOrderSymbols = new Set(
        (alpacaOpenOrders as { symbol?: string }[])
          .map((o) => {
            const sym = String(o.symbol || "");
            // Extract underlying from OCC symbol (e.g. AMD260424P00210000 → AMD)
            const match = sym.match(/^([A-Z]+)\d/);
            return match ? match[1] : sym;
          })
          .filter(Boolean)
      );

      for (const ticker of tickers) {
        const symbol = ticker.symbol as string;
        let cycleId = ticker.cycleId as string | null;

        if (!cycleId) {
          cycleId = genId();
          await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${cycleId}, ${ticker.id}, 'SELLING_PUTS', 0, 0, 0)`;
          log(`${symbol}: New cycle`);
        }

        const open = await sql`SELECT id, type FROM "Contract" WHERE "cycleId" = ${cycleId} AND status IN ('OPEN', 'PENDING')`;
        if (open.length > 0) { log(`${symbol}: Open ${open[0].type} contract, skipping`); continue; }

        // Check Alpaca for pending orders on this symbol (prevents duplicates for GTC limit orders)
        if (openOrderSymbols.has(symbol)) { log(`${symbol}: Open order on Alpaca, skipping`); continue; }

        const stage = ticker.stage as string || "SELLING_PUTS";

        // ── SELLING PUTS stage ──
        if (stage === "SELLING_PUTS") {
          switch (regime.regime) {
            case MarketRegime.NORMAL:
              await execNakedPut(symbol, cycleId, cashAvailable, account.equity, ticker.strikePreference as string, Number(ticker.allocation) || 0, override, log, logDb);
              break;

            case MarketRegime.CAUTIOUS:
              await execBullPutSpread(symbol, cycleId, cashAvailable * cautiousSizePct, log, logDb);
              break;

            case MarketRegime.DEFENSIVE:
              // No naked puts in defensive — try iron condor instead
              await execIronCondor(symbol, cycleId, defensiveMaxDte, log, logDb);
              break;

            case MarketRegime.BEAR:
              // No puts at all in bear — skip, bear call spreads only
              log(`${symbol}: BEAR regime — skipping puts, bear call spreads only`);
              break;
          }
        }

        // ── SELLING CALLS stage ──
        if (stage === "SELLING_CALLS" && ticker.costBasis) {
          switch (regime.regime) {
            case MarketRegime.NORMAL:
            case MarketRegime.CAUTIOUS:
              await execCoveredCall(symbol, cycleId, Number(ticker.costBasis), log, logDb);
              break;

            case MarketRegime.DEFENSIVE:
            case MarketRegime.BEAR:
              await execBearCallSpread(symbol, cycleId, regime.regime === MarketRegime.DEFENSIVE ? defensiveMaxDte : undefined, log, logDb);
              break;
          }
        }
      }

      // ── BEAR mode: SPY put hedge ──
      if (regime.regime === MarketRegime.BEAR) {
        const existingHedge = await sql`SELECT id FROM "Contract" WHERE "spreadType" = ${SpreadType.SPY_HEDGE} AND status IN ('OPEN', 'PENDING')`;
        if (existingHedge.length === 0) {
          try {
            const hedge = await buySpyPutHedge(account.equity);
            if (hedge) {
              await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "spreadType") VALUES (${genId()}, ${null}, 'PUT', 'BUY_TO_OPEN', ${hedge.contract.symbol}, ${hedge.contract.strikePrice}, ${new Date(hedge.contract.expirationDate)}, ${hedge.premium}, 1, 'OPEN', ${SpreadType.SPY_HEDGE})`;
              log(`SPY HEDGE: Bought ${hedge.contract.symbol} for $${hedge.premium.toFixed(2)}`);
              await logDb("TRADE", `SPY HEDGE: Bought ${hedge.contract.symbol} @ $${hedge.contract.strikePrice} for $${hedge.premium.toFixed(2)}`, "SPY");
            } else {
              log("SPY HEDGE: No suitable contract found or over budget");
            }
          } catch (e) {
            log(`SPY HEDGE error: ${e instanceof Error ? e.message : String(e)}`);
          }
        } else {
          log("SPY HEDGE: Already have active hedge");
        }
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

// ── Trade Execution Helpers ──────────────────────────────

async function execNakedPut(
  symbol: string, cycleId: string, cashAvailable: number, equity: number, strikePreference: string, allocation: number, override: boolean,
  log: (msg: string) => void, logDb: (level: string, msg: string, ticker?: string, data?: Record<string, unknown>) => Promise<void>
) {
  const put = await findBestPut(symbol, strikePreference);
  if (!put) { log(`${symbol}: No put found`); return; }
  const positionSize = put.strikePrice * 100;
  if (positionSize > equity * 0.5) { log(`${symbol}: Position $${positionSize.toLocaleString()} exceeds 50% of equity — too large for this account`); return; }
  if (cashAvailable < positionSize) { log(`${symbol}: Not enough cash ($${cashAvailable.toFixed(0)} < $${positionSize.toLocaleString()})`); return; }
  const q = await getOptionQuote(put.symbol);
  const premium = q.midPrice * 100;
  if (premium <= 0) { log(`${symbol}: No premium`); return; }

  if (!override) {
    const premCheck = await checkPremiumRichness(premium, put.strikePrice);
    if (!premCheck.allowed) { log(`${symbol}: GUARD — ${premCheck.reason}`); await logDb("WARN", premCheck.reason!, symbol); return; }

    // Per-ticker allocation overrides global risk cap
    if (allocation > 0 && positionSize <= allocation) {
      const minCashPct = await getConfigNum("min_cash_pct", 0.30);
      const minCash = equity * minCashPct;
      if (cashAvailable - positionSize < minCash) {
        log(`${symbol}: GUARD — Cash after trade $${(cashAvailable - positionSize).toFixed(0)} below ${(minCashPct * 100).toFixed(0)}% floor ($${minCash.toFixed(0)})`);
        await logDb("WARN", `Cash floor guard: $${(cashAvailable - positionSize).toFixed(0)} < $${minCash.toFixed(0)}`, symbol);
        return;
      }
    } else {
      const riskCheck = await checkRiskCap(put.strikePrice, equity, cashAvailable - positionSize);
      if (!riskCheck.allowed) { log(`${symbol}: GUARD — ${riskCheck.reason}`); await logDb("WARN", riskCheck.reason!, symbol); return; }
    }
  }

  log(`${symbol}: SELL PUT ${put.symbol} $${put.strikePrice} prem=$${premium.toFixed(2)}`);
  const order = await submitOptionOrder({ symbol: put.symbol, qty: 1, side: "sell", type: "limit", time_in_force: "gtc", limit_price: q.bidPrice > 0 ? q.bidPrice : q.midPrice });
  await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId") VALUES (${genId()}, ${cycleId}, 'PUT', 'SELL_TO_OPEN', ${put.symbol}, ${put.strikePrice}, ${new Date(put.expirationDate)}, ${premium}, 1, 'OPEN', ${String(order.id || '')})`;
  await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${premium} WHERE id = ${cycleId}`;
  await logDb("TRADE", `SOLD PUT: ${put.symbol} | Strike: $${put.strikePrice} | Premium: $${premium.toFixed(2)}`, symbol);
}

async function execBullPutSpread(
  symbol: string, cycleId: string, cashBudget: number,
  log: (msg: string) => void, logDb: (level: string, msg: string, ticker?: string, data?: Record<string, unknown>) => Promise<void>
) {
  const spread = await findBullPutSpread(symbol);
  if (!spread) { log(`${symbol}: No bull put spread found`); return; }
  if (spread.netPremium <= 0) { log(`${symbol}: Spread has no credit`); return; }

  const maxLoss = (spread.sellLeg.strikePrice - spread.buyLeg.strikePrice) * 100 - spread.netPremium;
  if (maxLoss > cashBudget) { log(`${symbol}: Spread max loss $${maxLoss.toFixed(0)} exceeds budget $${cashBudget.toFixed(0)}`); return; }

  log(`${symbol}: BULL PUT SPREAD sell=${spread.sellLeg.symbol} buy=${spread.buyLeg.symbol} net=$${spread.netPremium.toFixed(2)}`);
  const order = await submitSpreadOrder(spread.sellLeg.symbol, spread.buyLeg.symbol, "put");
  await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId", "spreadType", "protectionSymbol", "protectionPremium") VALUES (${genId()}, ${cycleId}, 'PUT', 'SELL_TO_OPEN', ${spread.sellLeg.symbol}, ${spread.sellLeg.strikePrice}, ${new Date(spread.sellLeg.expirationDate)}, ${spread.netPremium}, 1, 'OPEN', ${String(order.id || '')}, ${SpreadType.BULL_PUT_SPREAD}, ${spread.buyLeg.symbol}, ${spread.buyPremium})`;
  await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${spread.netPremium} WHERE id = ${cycleId}`;
  await logDb("TRADE", `BULL PUT SPREAD: ${symbol} | Sell $${spread.sellLeg.strikePrice} / Buy $${spread.buyLeg.strikePrice} | Net: $${spread.netPremium.toFixed(2)} | MaxLoss: $${maxLoss.toFixed(2)}`, symbol);
}

async function execBearCallSpread(
  symbol: string, cycleId: string, maxDte: number | undefined,
  log: (msg: string) => void, logDb: (level: string, msg: string, ticker?: string, data?: Record<string, unknown>) => Promise<void>
) {
  const spread = await findBearCallSpread(symbol, maxDte);
  if (!spread) { log(`${symbol}: No bear call spread found`); return; }

  log(`${symbol}: BEAR CALL SPREAD sell=${spread.sellLeg.symbol} buy=${spread.buyLeg.symbol} net=$${spread.netPremium.toFixed(2)}`);
  const order = await submitSpreadOrder(spread.sellLeg.symbol, spread.buyLeg.symbol, "call");
  await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId", "spreadType", "protectionSymbol", "protectionPremium") VALUES (${genId()}, ${cycleId}, 'CALL', 'SELL_TO_OPEN', ${spread.sellLeg.symbol}, ${spread.sellLeg.strikePrice}, ${new Date(spread.sellLeg.expirationDate)}, ${spread.netPremium}, 1, 'OPEN', ${String(order.id || '')}, ${SpreadType.BEAR_CALL_SPREAD}, ${spread.buyLeg.symbol}, ${spread.buyPremium})`;
  await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${spread.netPremium} WHERE id = ${cycleId}`;
  await logDb("TRADE", `BEAR CALL SPREAD: ${symbol} | Sell $${spread.sellLeg.strikePrice} / Buy $${spread.buyLeg.strikePrice} | Net: $${spread.netPremium.toFixed(2)}`, symbol);
}

async function execIronCondor(
  symbol: string, cycleId: string, maxDte: number,
  log: (msg: string) => void, logDb: (level: string, msg: string, ticker?: string, data?: Record<string, unknown>) => Promise<void>
) {
  const ic = await findIronCondor(symbol, maxDte);
  if (!ic) { log(`${symbol}: No iron condor found`); return; }

  // Submit put side
  const putOrder = await submitSpreadOrder(ic.putSpread.sellLeg.symbol, ic.putSpread.buyLeg.symbol, "put");
  await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId", "spreadType", "protectionSymbol", "protectionPremium") VALUES (${genId()}, ${cycleId}, 'PUT', 'SELL_TO_OPEN', ${ic.putSpread.sellLeg.symbol}, ${ic.putSpread.sellLeg.strikePrice}, ${new Date(ic.putSpread.sellLeg.expirationDate)}, ${ic.putSpread.netPremium}, 1, 'OPEN', ${String(putOrder.id || '')}, ${SpreadType.IRON_CONDOR_PUT}, ${ic.putSpread.buyLeg.symbol}, ${ic.putSpread.buyPremium})`;

  // Submit call side
  const callOrder = await submitSpreadOrder(ic.callSpread.sellLeg.symbol, ic.callSpread.buyLeg.symbol, "call");
  await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId", "spreadType", "protectionSymbol", "protectionPremium") VALUES (${genId()}, ${cycleId}, 'CALL', 'SELL_TO_OPEN', ${ic.callSpread.sellLeg.symbol}, ${ic.callSpread.sellLeg.strikePrice}, ${new Date(ic.callSpread.sellLeg.expirationDate)}, ${ic.callSpread.netPremium}, 1, 'OPEN', ${String(callOrder.id || '')}, ${SpreadType.IRON_CONDOR_CALL}, ${ic.callSpread.buyLeg.symbol}, ${ic.callSpread.buyPremium})`;

  const totalPremium = ic.putSpread.netPremium + ic.callSpread.netPremium;
  await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${totalPremium} WHERE id = ${cycleId}`;

  log(`${symbol}: IRON CONDOR | Put: $${ic.putSpread.sellLeg.strikePrice}/$${ic.putSpread.buyLeg.strikePrice} | Call: $${ic.callSpread.sellLeg.strikePrice}/$${ic.callSpread.buyLeg.strikePrice} | Total: $${totalPremium.toFixed(2)}`);
  await logDb("TRADE", `IRON CONDOR: ${symbol} | Net: $${totalPremium.toFixed(2)}`, symbol);
}

async function execCoveredCall(
  symbol: string, cycleId: string, costBasis: number,
  log: (msg: string) => void, logDb: (level: string, msg: string, ticker?: string, data?: Record<string, unknown>) => Promise<void>
) {
  const call = await findBestCall(symbol, costBasis);
  if (!call) { log(`${symbol}: No call found`); return; }
  const q = await getOptionQuote(call.symbol);
  const premium = q.midPrice * 100;
  if (premium <= 0) { log(`${symbol}: No premium`); return; }

  const callCheck = await checkCallPremium(premium);
  if (!callCheck.allowed) { log(`${symbol}: GUARD — ${callCheck.reason}`); await logDb("WARN", callCheck.reason!, symbol); return; }

  log(`${symbol}: SELL CALL ${call.symbol} $${call.strikePrice} prem=$${premium.toFixed(2)}`);
  const order = await submitOptionOrder({ symbol: call.symbol, qty: 1, side: "sell", type: "limit", time_in_force: "gtc", limit_price: q.bidPrice > 0 ? q.bidPrice : q.midPrice });
  await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId") VALUES (${genId()}, ${cycleId}, 'CALL', 'SELL_TO_OPEN', ${call.symbol}, ${call.strikePrice}, ${new Date(call.expirationDate)}, ${premium}, 1, 'OPEN', ${String(order.id || '')})`;
  await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${premium} WHERE id = ${cycleId}`;
  await logDb("TRADE", `SOLD CALL: ${call.symbol} | Strike: $${call.strikePrice} | Premium: $${premium.toFixed(2)}`, symbol);
}
