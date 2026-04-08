import { sql, genId } from "@/lib/db";
import { getAccount, submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { findBestPut } from "@/lib/options";
import { logInfo, logTrade, logWarn, logError } from "@/lib/logger";

export async function handleSellPut(tickerId: string, symbol: string, cycleId: string): Promise<void> {
  try {
    const existing = await sql`SELECT id FROM "Contract" WHERE "cycleId" = ${cycleId} AND status IN ('OPEN', 'PENDING')`;
    if (existing.length > 0) { logInfo("Already have an open contract, skipping", symbol); return; }

    const putContract = await findBestPut(symbol);
    if (!putContract) { logWarn("No suitable put contracts found", symbol); return; }

    const account = await getAccount();
    const cashNeeded = putContract.strikePrice * 100;
    if (account.cash < cashNeeded) { logWarn(`Insufficient cash. Need $${cashNeeded.toFixed(2)}, have $${account.cash.toFixed(2)}`, symbol); return; }

    const quote = await getOptionQuote(putContract.symbol);
    const estimatedPremium = quote.midPrice * 100;
    if (estimatedPremium <= 0) { logWarn(`Premium too low for ${putContract.symbol}`, symbol); return; }

    logInfo(`Selling put: ${putContract.symbol} strike=$${putContract.strikePrice} premium=$${estimatedPremium.toFixed(2)}`, symbol);
    const order = await submitOptionOrder({ symbol: putContract.symbol, qty: 1, side: "sell", type: "market", time_in_force: "day" });

    await sql`INSERT INTO "Contract" (id, "cycleId", type, action, symbol, "strikePrice", expiration, premium, quantity, status, "alpacaOrderId") VALUES (${genId()}, ${cycleId}, 'PUT', 'SELL_TO_OPEN', ${putContract.symbol}, ${putContract.strikePrice}, ${new Date(putContract.expirationDate)}, ${estimatedPremium}, 1, 'OPEN', ${String(order.id || '')})`;
    await sql`UPDATE "WheelCycle" SET "totalPremium" = "totalPremium" + ${estimatedPremium} WHERE id = ${cycleId}`;

    logTrade(`SOLD PUT: ${putContract.symbol} | Strike: $${putContract.strikePrice} | Premium: $${estimatedPremium.toFixed(2)}`, symbol);
  } catch (error) {
    logError(`Failed to sell put: ${error instanceof Error ? error.message : String(error)}`, symbol);
  }
}
