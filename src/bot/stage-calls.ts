import { sql, genId } from "@/lib/db";
import { submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { findBestCall } from "@/lib/options";
import { logInfo, logTrade, logWarn, logError } from "@/lib/logger";

export async function handleSellCall(tickerId: string, symbol: string, cycleId: string, costBasis: number): Promise<void> {
  try {
    const existing = await sql`SELECT id FROM "Contract" WHERE "cycleId" = ${cycleId} AND status IN ('OPEN', 'PENDING')`;
    if (existing.length > 0) { logInfo("Already have an open contract, skipping", symbol); return; }

    const callContract = await findBestCall(symbol, costBasis);
    if (!callContract) { logWarn(`No suitable call above cost basis $${costBasis.toFixed(2)}`, symbol); return; }
    if (callContract.strikePrice < costBasis) { logWarn(`Call strike below cost basis, skipping`, symbol); return; }

    const quote = await getOptionQuote(callContract.symbol);
    const estimatedPremium = quote.midPrice * 100;
    if (estimatedPremium <= 0) { logWarn(`Premium too low for ${callContract.symbol}`, symbol); return; }

    logInfo(`Selling call: ${callContract.symbol} strike=$${callContract.strikePrice} premium=$${estimatedPremium.toFixed(2)}`, symbol);
    const order = await submitOptionOrder({ symbol: callContract.symbol, qty: 1, side: "sell", type: "market", time_in_force: "day" });

    await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId") VALUES (${genId()}, ${cycleId}, 'CALL', 'SELL_TO_OPEN', ${callContract.symbol}, ${callContract.strikePrice}, ${new Date(callContract.expirationDate)}, ${estimatedPremium}, 1, 'OPEN', ${String(order.id || '')})`;
    await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${estimatedPremium} WHERE id = ${cycleId}`;

    logTrade(`SOLD CALL: ${callContract.symbol} | Strike: $${callContract.strikePrice} | Premium: $${estimatedPremium.toFixed(2)}`, symbol);
  } catch (error) {
    logError(`Failed to sell call: ${error instanceof Error ? error.message : String(error)}`, symbol);
  }
}
