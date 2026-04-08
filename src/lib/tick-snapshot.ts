import { sql, genId } from "./db";
import { getAccount, getPositions, getOptionQuote } from "./alpaca";
import { getCurrentPrice } from "./options";

/**
 * Log a full position snapshot at the start of every tick.
 * Returns the account for reuse by the caller.
 */
export async function logTickSnapshot() {
  const [account, positions] = await Promise.all([
    getAccount(),
    getPositions(),
  ]);

  const activeCycles = await sql`
    SELECT wc.stage, wc."totalPremium", wc."costBasis", wc."sharesHeld", t.symbol
    FROM "WheelCycle" wc
    JOIN "Ticker" t ON t.id = wc."tickerId"
    WHERE wc."completedAt" IS NULL
  `;

  const tickerSnapshots = [];
  for (const cycle of activeCycles) {
    const symbol = cycle.symbol as string;
    let price = 0;
    try { price = await getCurrentPrice(symbol); } catch { /* skip */ }

    const pos = positions.find((p) => p.symbol === symbol);

    // Get open option contract quote
    const openContracts = await sql`
      SELECT c.symbol, c.type, c."strikePrice", c.premium FROM "Contract" c
      JOIN "WheelCycle" wc ON wc.id = c."cycleId"
      JOIN "Ticker" t ON t.id = wc."tickerId"
      WHERE t.symbol = ${symbol} AND c.status IN ('OPEN', 'PENDING')
      LIMIT 1
    `;
    let optionMid = 0;
    if (openContracts.length > 0) {
      try {
        const q = await getOptionQuote(openContracts[0].symbol as string);
        optionMid = q.midPrice;
      } catch { /* skip */ }
    }

    tickerSnapshots.push({
      symbol,
      price: Math.round(price * 100) / 100,
      stage: cycle.stage,
      premium: Number(cycle.totalPremium),
      shares: Number(cycle.sharesHeld),
      costBasis: cycle.costBasis ? Number(cycle.costBasis) : null,
      unrealizedPL: pos ? Math.round(pos.unrealizedPL * 100) / 100 : 0,
      optionMid: Math.round(optionMid * 100) / 100,
    });
  }

  const snapshot = {
    cash: Math.round(account.cash * 100) / 100,
    equity: Math.round(account.equity * 100) / 100,
    buyingPower: Math.round(account.buyingPower * 100) / 100,
    positions: tickerSnapshots,
  };

  const summary = tickerSnapshots
    .map((t) => `${t.symbol}: $${t.price} [${t.stage}] opt=$${t.optionMid}`)
    .join(" | ");

  await sql`INSERT INTO "TradeLog" (id, timestamp, level, message, data)
    VALUES (${genId()}, now(), 'TICK', ${`Cash: $${snapshot.cash} | Equity: $${snapshot.equity} | ${summary}`}, ${JSON.stringify(snapshot)})`;

  return account;
}
