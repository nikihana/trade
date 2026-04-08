import { prisma } from "@/lib/db";
import { getAccount, submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { findBestPut } from "@/lib/options";
import { logInfo, logTrade, logWarn, logError } from "@/lib/logger";
import {
  WheelStage,
  ContractType,
  ContractAction,
  ContractStatus,
} from "@/lib/types";

/**
 * Stage 1: Sell a cash-secured put
 * - Find a put ~10% below current price
 * - Ensure we have enough cash to cover assignment
 * - Sell the put, collect premium
 */
export async function handleSellPut(
  tickerId: string,
  symbol: string,
  cycleId: string
): Promise<void> {
  try {
    // Check if there's already an open contract for this cycle
    const existingContract = await prisma.contract.findFirst({
      where: {
        cycleId,
        status: { in: [ContractStatus.PENDING, ContractStatus.OPEN] },
      },
    });

    if (existingContract) {
      logInfo(
        `Already have an open ${existingContract.type} contract, skipping`,
        symbol
      );
      return;
    }

    // Find the best put
    const putContract = await findBestPut(symbol);
    if (!putContract) {
      logWarn("No suitable put contracts found", symbol);
      return;
    }

    // Check cash to cover assignment (100 shares * strike price)
    const account = await getAccount();
    const cashNeeded = putContract.strikePrice * 100;

    if (account.cash < cashNeeded) {
      logWarn(
        `Insufficient cash for put. Need $${cashNeeded.toFixed(2)}, have $${account.cash.toFixed(2)}`,
        symbol
      );
      return;
    }

    // Get the option quote for premium estimate
    const quote = await getOptionQuote(putContract.symbol);
    const estimatedPremium = quote.midPrice * 100; // per contract (100 shares)

    if (estimatedPremium <= 0) {
      logWarn(
        `Premium too low or unavailable for ${putContract.symbol}`,
        symbol
      );
      return;
    }

    // Submit the sell-to-open order
    logInfo(
      `Selling put: ${putContract.symbol} strike=$${putContract.strikePrice} exp=${putContract.expirationDate} est_premium=$${estimatedPremium.toFixed(2)}`,
      symbol
    );

    const order = await submitOptionOrder({
      symbol: putContract.symbol,
      qty: 1,
      side: "sell",
      type: "market",
      time_in_force: "day",
    });

    // Record in database
    await prisma.contract.create({
      data: {
        cycleId,
        type: ContractType.PUT,
        action: ContractAction.SELL_TO_OPEN,
        symbol: putContract.symbol,
        strikePrice: putContract.strikePrice,
        expiration: new Date(putContract.expirationDate),
        premium: estimatedPremium,
        quantity: 1,
        status: ContractStatus.OPEN,
        alpacaOrderId: String(order.id || ""),
      },
    });

    // Update cycle premium
    await prisma.wheelCycle.update({
      where: { id: cycleId },
      data: {
        totalPremium: { increment: estimatedPremium },
      },
    });

    logTrade(
      `SOLD PUT: ${putContract.symbol} | Strike: $${putContract.strikePrice} | Premium: $${estimatedPremium.toFixed(2)} | Exp: ${putContract.expirationDate}`,
      symbol,
      {
        orderId: order.id,
        strike: putContract.strikePrice,
        premium: estimatedPremium,
        expiration: putContract.expirationDate,
      }
    );
  } catch (error) {
    logError(
      `Failed to sell put: ${error instanceof Error ? error.message : String(error)}`,
      symbol
    );
  }
}
