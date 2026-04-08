import { prisma } from "@/lib/db";
import { getPositions, submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { logInfo, logTrade, logWarn } from "@/lib/logger";
import {
  WheelStage,
  ContractType,
  ContractStatus,
  ContractAction,
  CloseReason,
} from "@/lib/types";

/**
 * Monitor all open contracts:
 * 1. Check for 50% profit target → close early
 * 2. Detect assignments (shares appeared) → transition to SELLING_CALLS
 * 3. Detect call-away (shares disappeared) → transition back to SELLING_PUTS
 * 4. Detect expirations
 */
export async function monitorPositions(): Promise<void> {
  // Get all Alpaca stock positions
  const alpacaPositions = await getPositions();
  const positionMap = new Map(
    alpacaPositions
      .filter((p) => !p.symbol.includes(" ")) // stock positions only (not options)
      .map((p) => [p.symbol, p])
  );

  // Get all active cycles
  const activeCycles = await prisma.wheelCycle.findMany({
    where: { completedAt: null },
    include: {
      ticker: true,
      contracts: {
        where: { status: { in: [ContractStatus.OPEN, ContractStatus.PENDING] } },
      },
    },
  });

  for (const cycle of activeCycles) {
    const symbol = cycle.ticker.symbol;
    const position = positionMap.get(symbol);
    const hasShares = position && position.qty >= 100;

    // ── Check for 50% profit on open contracts ──
    for (const contract of cycle.contracts) {
      await checkProfitTarget(contract, symbol);
    }

    // ── Detect Assignment (PUT was open, now we have shares) ──
    if (cycle.stage === WheelStage.SELLING_PUTS && hasShares) {
      logTrade(`ASSIGNMENT DETECTED: Now holding ${position.qty} shares`, symbol);

      // Mark any open put contracts as assigned
      for (const contract of cycle.contracts) {
        if (contract.type === ContractType.PUT) {
          await prisma.contract.update({
            where: { id: contract.id },
            data: {
              status: ContractStatus.ASSIGNED,
              closedAt: new Date(),
              closedReason: CloseReason.ASSIGNMENT,
            },
          });
        }
      }

      // Transition to HOLDING_SHARES → SELLING_CALLS
      const effectiveCost = position.avgEntryPrice;
      await prisma.wheelCycle.update({
        where: { id: cycle.id },
        data: {
          stage: WheelStage.SELLING_CALLS,
          costBasis: effectiveCost,
          sharesHeld: position.qty,
        },
      });

      logInfo(
        `Transitioned to SELLING_CALLS. Cost basis: $${effectiveCost.toFixed(2)}`,
        symbol
      );
    }

    // ── Detect Call-Away (CALLS were open, shares are gone) ──
    if (cycle.stage === WheelStage.SELLING_CALLS && !hasShares) {
      // Check if we had a call contract that's now gone
      const hadOpenCall = cycle.contracts.some(
        (c) => c.type === ContractType.CALL
      );

      if (hadOpenCall || cycle.sharesHeld > 0) {
        logTrade("CALL-AWAY DETECTED: Shares sold, completing cycle", symbol);

        // Mark call contracts as assigned
        for (const contract of cycle.contracts) {
          if (contract.type === ContractType.CALL) {
            await prisma.contract.update({
              where: { id: contract.id },
              data: {
                status: ContractStatus.ASSIGNED,
                closedAt: new Date(),
                closedReason: CloseReason.ASSIGNMENT,
              },
            });
          }
        }

        // Calculate realized P&L for this cycle
        const sellPrice = cycle.contracts.find(
          (c) => c.type === ContractType.CALL
        )?.strikePrice;
        const realizedPL = sellPrice
          ? (sellPrice - (cycle.costBasis || 0)) * 100 + cycle.totalPremium
          : cycle.totalPremium;

        // Complete the cycle
        await prisma.wheelCycle.update({
          where: { id: cycle.id },
          data: {
            completedAt: new Date(),
            sharesHeld: 0,
            realizedPL,
          },
        });

        // Start a new cycle for this ticker
        await prisma.wheelCycle.create({
          data: {
            tickerId: cycle.tickerId,
            stage: WheelStage.SELLING_PUTS,
          },
        });

        logTrade(
          `Cycle complete! Realized P&L: $${realizedPL.toFixed(2)}. Starting new cycle.`,
          symbol,
          { realizedPL, totalPremium: cycle.totalPremium }
        );
      }
    }

    // ── Detect expired contracts ──
    const now = new Date();
    for (const contract of cycle.contracts) {
      if (
        contract.status === ContractStatus.OPEN &&
        new Date(contract.expiration) < now
      ) {
        await prisma.contract.update({
          where: { id: contract.id },
          data: {
            status: ContractStatus.EXPIRED,
            closedAt: now,
            closedReason: CloseReason.EXPIRATION,
          },
        });
        logInfo(
          `Contract expired: ${contract.symbol}`,
          symbol
        );
      }
    }
  }
}

/**
 * Check if a contract has hit 50% profit and close it early
 */
async function checkProfitTarget(
  contract: { id: string; symbol: string; premium: number; cycleId: string; type: string },
  tickerSymbol: string
): Promise<void> {
  try {
    const quote = await getOptionQuote(contract.symbol);
    if (quote.midPrice <= 0) return;

    const currentCost = quote.midPrice * 100; // cost to buy back
    const profitPercent =
      ((contract.premium - currentCost) / contract.premium) * 100;

    if (profitPercent >= 50) {
      logInfo(
        `50% profit target hit on ${contract.symbol} (${profitPercent.toFixed(1)}%)`,
        tickerSymbol
      );

      // Buy to close
      const order = await submitOptionOrder({
        symbol: contract.symbol,
        qty: 1,
        side: "buy",
        type: "market",
        time_in_force: "day",
      });

      await prisma.contract.update({
        where: { id: contract.id },
        data: {
          status: ContractStatus.CLOSED,
          closedAt: new Date(),
          closePrice: currentCost,
          closedReason: CloseReason.PROFIT_TARGET,
          alpacaOrderId: String(order.id || ""),
        },
      });

      logTrade(
        `CLOSED at 50% profit: ${contract.symbol} | Paid $${currentCost.toFixed(2)} to close | Profit: $${(contract.premium - currentCost).toFixed(2)}`,
        tickerSymbol,
        { profitPercent, closePrice: currentCost, premium: contract.premium }
      );
    }
  } catch {
    // Silently skip — quote might not be available
  }
}
