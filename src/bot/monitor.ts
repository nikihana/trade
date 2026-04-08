import { sql, genId } from "@/lib/db";
import { getPositions, submitOptionOrder, getOptionQuote } from "@/lib/alpaca";
import { logInfo, logTrade } from "@/lib/logger";

export async function monitorPositions(): Promise<void> {
  const alpacaPositions = await getPositions();
  const positionMap = new Map(
    alpacaPositions.filter((p) => !p.symbol.includes(" ")).map((p) => [p.symbol, p])
  );

  const activeCycles = await sql`
    SELECT wc.*, t.symbol FROM "WheelCycle" wc
    JOIN "Ticker" t ON t.id = wc."tickerId"
    WHERE wc."completedAt" IS NULL
  `;

  for (const cycle of activeCycles) {
    const symbol = cycle.symbol as string;
    const position = positionMap.get(symbol);
    const hasShares = position && position.qty >= 100;
    const openContracts = await sql`SELECT * FROM "Contract" WHERE "cycleId" = ${cycle.id} AND status IN ('OPEN', 'PENDING')`;

    // Check 50% profit
    for (const contract of openContracts) {
      try {
        const quote = await getOptionQuote(contract.symbol as string);
        if (quote.midPrice <= 0) continue;
        const currentCost = quote.midPrice * 100;
        const profitPct = ((Number(contract.premium) - currentCost) / Number(contract.premium)) * 100;
        if (profitPct >= 50) {
          logInfo(`50% profit hit on ${contract.symbol} (${profitPct.toFixed(1)}%)`, symbol);
          await submitOptionOrder({ symbol: contract.symbol as string, qty: 1, side: "buy", type: "market", time_in_force: "day" });
          await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now(), "closePrice" = ${currentCost}, "closedReason" = 'PROFIT_TARGET' WHERE id = ${contract.id}`;
          logTrade(`CLOSED at 50% profit: ${contract.symbol}`, symbol);
        }
      } catch { /* skip */ }
    }

    // Detect assignment
    if (cycle.stage === "SELLING_PUTS" && hasShares) {
      logTrade(`ASSIGNMENT DETECTED: Now holding ${position.qty} shares`, symbol);
      await sql`UPDATE "Contract" SET status = 'ASSIGNED', "closedAt" = now(), "closedReason" = 'ASSIGNMENT' WHERE "cycleId" = ${cycle.id} AND type = 'PUT' AND status IN ('OPEN', 'PENDING')`;
      await sql`UPDATE "WheelCycle" SET stage = 'SELLING_CALLS', "costBasis" = ${position.avgEntryPrice}, "sharesHeld" = ${position.qty} WHERE id = ${cycle.id}`;
    }

    // Detect call-away
    if (cycle.stage === "SELLING_CALLS" && !hasShares && Number(cycle.sharesHeld) > 0) {
      logTrade("CALL-AWAY DETECTED: Shares sold, completing cycle", symbol);
      await sql`UPDATE "Contract" SET status = 'ASSIGNED', "closedAt" = now(), "closedReason" = 'ASSIGNMENT' WHERE "cycleId" = ${cycle.id} AND type = 'CALL' AND status IN ('OPEN', 'PENDING')`;
      const callContract = openContracts.find((c) => c.type === "CALL");
      const sellPrice = callContract ? Number(callContract.strikePrice) : 0;
      const realizedPL = sellPrice ? (sellPrice - Number(cycle.costBasis || 0)) * 100 + Number(cycle.totalPremium) : Number(cycle.totalPremium);
      await sql`UPDATE "WheelCycle" SET "completedAt" = now(), "sharesHeld" = 0, "realizedPL" = ${realizedPL} WHERE id = ${cycle.id}`;
      await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${genId()}, ${cycle.tickerId}, 'SELLING_PUTS', 0, 0, 0)`;
      logTrade(`Cycle complete! P&L: $${realizedPL.toFixed(2)}`, symbol);
    }

    // Detect expired contracts
    await sql`UPDATE "Contract" SET status = 'EXPIRED', "closedAt" = now(), "closedReason" = 'EXPIRATION' WHERE "cycleId" = ${cycle.id} AND status = 'OPEN' AND expiration < now()`;
  }
}
