import { prisma } from "@/lib/db";
import { submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { findBestCall } from "@/lib/options";
import { logInfo, logTrade, logWarn, logError } from "@/lib/logger";
import {
  ContractType,
  ContractAction,
  ContractStatus,
} from "@/lib/types";

/**
 * Stage 2: Sell a covered call
 * - Find a call ~10% above cost basis
 * - Never sell below cost basis
 * - Sell the call, collect premium
 */
export async function handleSellCall(
  tickerId: string,
  symbol: string,
  cycleId: string,
  costBasis: number
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

    // Find the best call above cost basis
    const callContract = await findBestCall(symbol, costBasis);
    if (!callContract) {
      logWarn(
        `No suitable call contracts found above cost basis $${costBasis.toFixed(2)}`,
        symbol
      );
      return;
    }

    // Double-check: never sell below cost basis
    if (callContract.strikePrice < costBasis) {
      logWarn(
        `Call strike $${callContract.strikePrice} is below cost basis $${costBasis.toFixed(2)}, skipping`,
        symbol
      );
      return;
    }

    // Get the option quote
    const quote = await getOptionQuote(callContract.symbol);
    const estimatedPremium = quote.midPrice * 100;

    if (estimatedPremium <= 0) {
      logWarn(
        `Premium too low or unavailable for ${callContract.symbol}`,
        symbol
      );
      return;
    }

    // Submit the sell-to-open order
    logInfo(
      `Selling call: ${callContract.symbol} strike=$${callContract.strikePrice} exp=${callContract.expirationDate} est_premium=$${estimatedPremium.toFixed(2)}`,
      symbol
    );

    const order = await submitOptionOrder({
      symbol: callContract.symbol,
      qty: 1,
      side: "sell",
      type: "market",
      time_in_force: "day",
    });

    // Record in database
    await prisma.contract.create({
      data: {
        cycleId,
        type: ContractType.CALL,
        action: ContractAction.SELL_TO_OPEN,
        symbol: callContract.symbol,
        strikePrice: callContract.strikePrice,
        expiration: new Date(callContract.expirationDate),
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
      `SOLD CALL: ${callContract.symbol} | Strike: $${callContract.strikePrice} | Premium: $${estimatedPremium.toFixed(2)} | Exp: ${callContract.expirationDate}`,
      symbol,
      {
        orderId: order.id,
        strike: callContract.strikePrice,
        premium: estimatedPremium,
        expiration: callContract.expirationDate,
        costBasis,
      }
    );
  } catch (error) {
    logError(
      `Failed to sell call: ${error instanceof Error ? error.message : String(error)}`,
      symbol
    );
  }
}
