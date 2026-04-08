import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAccount, getPositions, submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { findBestPut, findBestCall } from "@/lib/options";
import { WheelStage, ContractType, ContractAction, ContractStatus, CloseReason } from "@/lib/types";

/**
 * POST /api/bot/tick — Run one cycle of the wheel engine on demand
 */
export async function POST() {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    console.log(`[tick] ${msg}`);
  };

  try {
    // ── Monitor existing positions ──
    const alpacaPositions = await getPositions();
    const stockPositions = new Map(
      alpacaPositions
        .filter((p) => !p.symbol.includes(" "))
        .map((p) => [p.symbol, p])
    );

    const activeCycles = await prisma.wheelCycle.findMany({
      where: { completedAt: null },
      include: {
        ticker: true,
        contracts: {
          where: { status: { in: [ContractStatus.OPEN, ContractStatus.PENDING] } },
        },
      },
    });

    // Check for assignments, call-aways, 50% profit
    for (const cycle of activeCycles) {
      const symbol = cycle.ticker.symbol;
      const position = stockPositions.get(symbol);
      const hasShares = position && position.qty >= 100;

      // Check 50% profit on open contracts
      for (const contract of cycle.contracts) {
        try {
          const quote = await getOptionQuote(contract.symbol);
          if (quote.midPrice <= 0) continue;
          const currentCost = quote.midPrice * 100;
          const profitPct = ((contract.premium - currentCost) / contract.premium) * 100;
          if (profitPct >= 50) {
            log(`${symbol}: 50% profit hit on ${contract.type} (${profitPct.toFixed(0)}%), closing`);
            await submitOptionOrder({ symbol: contract.symbol, qty: 1, side: "buy", type: "market", time_in_force: "day" });
            await prisma.contract.update({
              where: { id: contract.id },
              data: { status: ContractStatus.CLOSED, closedAt: new Date(), closePrice: currentCost, closedReason: CloseReason.PROFIT_TARGET },
            });
          }
        } catch { /* skip */ }
      }

      // Detect assignment (put open, shares appeared)
      if (cycle.stage === WheelStage.SELLING_PUTS && hasShares) {
        log(`${symbol}: ASSIGNMENT DETECTED — now holding ${position.qty} shares`);
        for (const c of cycle.contracts) {
          if (c.type === ContractType.PUT) {
            await prisma.contract.update({ where: { id: c.id }, data: { status: ContractStatus.ASSIGNED, closedAt: new Date(), closedReason: CloseReason.ASSIGNMENT } });
          }
        }
        await prisma.wheelCycle.update({
          where: { id: cycle.id },
          data: { stage: WheelStage.SELLING_CALLS, costBasis: position.avgEntryPrice, sharesHeld: position.qty },
        });
      }

      // Detect call-away (calls open, shares gone)
      if (cycle.stage === WheelStage.SELLING_CALLS && !hasShares && cycle.sharesHeld > 0) {
        log(`${symbol}: CALL-AWAY DETECTED — shares sold, completing cycle`);
        for (const c of cycle.contracts) {
          if (c.type === ContractType.CALL) {
            await prisma.contract.update({ where: { id: c.id }, data: { status: ContractStatus.ASSIGNED, closedAt: new Date(), closedReason: CloseReason.ASSIGNMENT } });
          }
        }
        const sellPrice = cycle.contracts.find((c) => c.type === ContractType.CALL)?.strikePrice;
        const realizedPL = sellPrice ? (sellPrice - (cycle.costBasis || 0)) * 100 + cycle.totalPremium : cycle.totalPremium;
        await prisma.wheelCycle.update({ where: { id: cycle.id }, data: { completedAt: new Date(), sharesHeld: 0, realizedPL } });
        await prisma.wheelCycle.create({ data: { tickerId: cycle.tickerId, stage: WheelStage.SELLING_PUTS } });
        log(`${symbol}: Cycle complete! P&L: $${realizedPL.toFixed(2)}`);
      }

      // Detect expired contracts
      const now = new Date();
      for (const c of cycle.contracts) {
        if (c.status === ContractStatus.OPEN && new Date(c.expiration) < now) {
          await prisma.contract.update({ where: { id: c.id }, data: { status: ContractStatus.EXPIRED, closedAt: now, closedReason: CloseReason.EXPIRATION } });
          log(`${symbol}: Contract expired: ${c.symbol}`);
        }
      }
    }

    // ── Execute trades for tickers needing action ──
    const tickers = await prisma.ticker.findMany({
      where: { active: true },
      include: {
        cycles: {
          where: { completedAt: null },
          include: {
            contracts: { where: { status: { in: [ContractStatus.OPEN, ContractStatus.PENDING] } } },
          },
        },
      },
    });

    const account = await getAccount();

    for (const ticker of tickers) {
      let cycle = ticker.cycles[0];

      if (!cycle) {
        cycle = await prisma.wheelCycle.create({
          data: { tickerId: ticker.id, stage: WheelStage.SELLING_PUTS },
          include: { contracts: true },
        });
        log(`${ticker.symbol}: Created new wheel cycle`);
      }

      // Skip if there's already an open contract
      if (cycle.contracts.length > 0) {
        log(`${ticker.symbol}: Open ${cycle.contracts[0].type} contract exists, skipping`);
        continue;
      }

      if (cycle.stage === WheelStage.SELLING_PUTS) {
        const put = await findBestPut(ticker.symbol);
        if (!put) { log(`${ticker.symbol}: No suitable put found`); continue; }

        const cashNeeded = put.strikePrice * 100;
        if (account.cash < cashNeeded) { log(`${ticker.symbol}: Not enough cash ($${account.cash.toFixed(0)} < $${cashNeeded.toFixed(0)})`); continue; }

        const quote = await getOptionQuote(put.symbol);
        const premium = quote.midPrice * 100;
        if (premium <= 0) { log(`${ticker.symbol}: No premium available`); continue; }

        log(`${ticker.symbol}: SELLING PUT ${put.symbol} strike=$${put.strikePrice} premium=$${premium.toFixed(2)}`);
        const order = await submitOptionOrder({ symbol: put.symbol, qty: 1, side: "sell", type: "market", time_in_force: "day" });

        await prisma.contract.create({
          data: { cycleId: cycle.id, type: ContractType.PUT, action: ContractAction.SELL_TO_OPEN, symbol: put.symbol, strikePrice: put.strikePrice, expiration: new Date(put.expirationDate), premium, quantity: 1, status: ContractStatus.OPEN, alpacaOrderId: String(order.id || "") },
        });
        await prisma.wheelCycle.update({ where: { id: cycle.id }, data: { totalPremium: { increment: premium } } });

        // Log the trade
        await prisma.tradeLog.create({
          data: { level: "TRADE", ticker: ticker.symbol, message: `SOLD PUT: ${put.symbol} | Strike: $${put.strikePrice} | Premium: $${premium.toFixed(2)} | Exp: ${put.expirationDate}` },
        });

        account.cash -= cashNeeded; // track locally for multi-ticker
      }

      if (cycle.stage === WheelStage.SELLING_CALLS && cycle.costBasis) {
        const call = await findBestCall(ticker.symbol, cycle.costBasis);
        if (!call) { log(`${ticker.symbol}: No suitable call above cost basis $${cycle.costBasis.toFixed(2)}`); continue; }

        const quote = await getOptionQuote(call.symbol);
        const premium = quote.midPrice * 100;
        if (premium <= 0) { log(`${ticker.symbol}: No premium available`); continue; }

        log(`${ticker.symbol}: SELLING CALL ${call.symbol} strike=$${call.strikePrice} premium=$${premium.toFixed(2)}`);
        const order = await submitOptionOrder({ symbol: call.symbol, qty: 1, side: "sell", type: "market", time_in_force: "day" });

        await prisma.contract.create({
          data: { cycleId: cycle.id, type: ContractType.CALL, action: ContractAction.SELL_TO_OPEN, symbol: call.symbol, strikePrice: call.strikePrice, expiration: new Date(call.expirationDate), premium, quantity: 1, status: ContractStatus.OPEN, alpacaOrderId: String(order.id || "") },
        });
        await prisma.wheelCycle.update({ where: { id: cycle.id }, data: { totalPremium: { increment: premium } } });

        await prisma.tradeLog.create({
          data: { level: "TRADE", ticker: ticker.symbol, message: `SOLD CALL: ${call.symbol} | Strike: $${call.strikePrice} | Premium: $${premium.toFixed(2)} | Exp: ${call.expirationDate}` },
        });
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
