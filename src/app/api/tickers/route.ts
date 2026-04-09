import { NextRequest, NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import { getOptionQuote, getAccount, getPositions, getOrders } from "@/lib/alpaca";
import { checkTickerApproved, checkAvgVolume, checkPremiumRichness, checkRiskCap } from "@/lib/guards";
import { findBestPut } from "@/lib/options";
import { getConfigNum } from "@/lib/config";

export async function GET() {
  try {
    // Lightweight reconciliation on page load
    try {
      const alpacaPositions = await getPositions();
      const alpacaSymbols = new Set(
        alpacaPositions.filter((p) => p.qty < 0).map((p) => p.symbol)
      );

      // Check PENDING_CLOSE contracts — if Alpaca no longer holds them, they filled
      const pendingCloses = await sql`
        SELECT c.id, c.symbol, c.premium, c."closePrice", c."cycleId"
        FROM "Contract" c WHERE c.status = 'PENDING_CLOSE'
      `;
      for (const c of pendingCloses) {
        if (!alpacaSymbols.has(c.symbol as string)) {
          // Position gone — close order filled
          const netPL = Number(c.premium) - Number(c.closePrice || 0);
          await sql`UPDATE "Contract" SET status = 'CLOSED', "closedAt" = now() WHERE id = ${c.id}`;
          await sql`UPDATE "WheelCycle" SET "realizedPL" = "realizedPL" + ${netPL}, "completedAt" = now() WHERE id = ${c.cycleId}`;
          // Deactivate ticker
          await sql`UPDATE "Ticker" SET active = false WHERE id IN (SELECT "tickerId" FROM "WheelCycle" WHERE id = ${c.cycleId})`;
        }
      }
    } catch { /* don't block page load if reconciliation fails */ }

    const tickers = await sql`
      SELECT t.id, t.symbol, t.active, t.allocation, t."strikePreference",
        wc.id as "cycleId", wc.stage, wc."totalPremium", wc."costBasis", wc."sharesHeld"
      FROM "Ticker" t
      LEFT JOIN "WheelCycle" wc ON wc."tickerId" = t.id AND wc."completedAt" IS NULL
      WHERE t.active = true
      ORDER BY t."createdAt" ASC
    `;

    const result = [];
    for (const t of tickers) {
      let openContract = null;
      if (t.cycleId) {
        const contracts = await sql`
          SELECT id, type, "strikePrice", expiration, premium, status, symbol as "optionSymbol", "closedReason"
          FROM "Contract"
          WHERE "cycleId" = ${t.cycleId} AND status IN ('OPEN', 'PENDING', 'PENDING_CLOSE')
          LIMIT 1
        `;
        if (contracts[0]) {
          const c = contracts[0];
          let buybackCost = 0;
          try {
            const q = await getOptionQuote(c.optionSymbol as string);
            buybackCost = Math.round(q.midPrice * 100 * 100) / 100;
          } catch { /* skip */ }
          openContract = {
            type: c.type,
            strikePrice: c.strikePrice,
            expiration: c.expiration,
            premium: Number(c.premium),
            status: c.status,
            buybackCost,
            closedReason: c.closedReason,
          };
        }
      }

      const premium = openContract ? openContract.premium : 0;
      const buyback = openContract ? openContract.buybackCost : 0;

      // Check guards for pending tickers (no open contract)
      let guardBlock: string | null = null;
      if (!openContract) {
        try {
          const account = await getAccount();
          const put = await findBestPut(t.symbol as string, (t.strikePreference as string) || "10pct-otm");
          if (put) {
            const pq = await getOptionQuote(put.symbol);
            const putPremium = pq.midPrice * 100;
            const posSize = put.strikePrice * 100;
            const alloc = Number(t.allocation) || 0;

            const premCheck = await checkPremiumRichness(putPremium, put.strikePrice);
            if (!premCheck.allowed) {
              guardBlock = premCheck.reason!;
            } else if (alloc > 0 && posSize > alloc) {
              guardBlock = `Position $${posSize.toLocaleString()} exceeds $${alloc.toLocaleString()} allocation`;
            } else if (alloc <= 0 || posSize > alloc) {
              const riskCheck = await checkRiskCap(put.strikePrice, account.equity, account.cash - posSize);
              if (!riskCheck.allowed) guardBlock = riskCheck.reason!;
            }

            const minCashPct = await getConfigNum("min_cash_pct", 0.30);
            if (!guardBlock && account.cash - posSize < account.equity * minCashPct) {
              guardBlock = `Cash floor: $${(account.cash - posSize).toFixed(0)} below ${(minCashPct * 100).toFixed(0)}% of equity`;
            }
          }
        } catch { /* skip guard check on error */ }
      }

      result.push({
        id: t.id,
        symbol: t.symbol,
        active: t.active,
        allocation: Number(t.allocation) || 0,
        strikePreference: t.strikePreference || "10pct-otm",
        stage: t.stage || null,
        totalPremium: Number(t.totalPremium) || 0,
        costBasis: t.costBasis ? Number(t.costBasis) : null,
        sharesHeld: Number(t.sharesHeld) || 0,
        openContract,
        cycleId: t.cycleId || null,
        livePL: premium > 0 ? Math.round((premium - buyback) * 100) / 100 : null,
        guardBlock,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { symbol, allocation, strikePreference } = await request.json();
    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const alloc = Number(allocation) || 0;
    if (alloc <= 0) {
      return NextResponse.json({ error: "Allocation must be greater than 0" }, { status: 400 });
    }

    const strikePref = strikePreference || "10pct-otm";
    const upperSymbol = symbol.toUpperCase().trim();

    const approvedCheck = await checkTickerApproved(upperSymbol);
    if (!approvedCheck.allowed) {
      return NextResponse.json({ error: approvedCheck.reason }, { status: 400 });
    }

    const volumeCheck = await checkAvgVolume(upperSymbol);
    if (!volumeCheck.allowed) {
      return NextResponse.json({ error: volumeCheck.reason }, { status: 400 });
    }

    const existing = await sql`SELECT id, active FROM "Ticker" WHERE symbol = ${upperSymbol}`;

    if (existing.length > 0) {
      const ticker = existing[0];
      await sql`UPDATE "Ticker" SET active = true, allocation = ${alloc}, "strikePreference" = ${strikePref} WHERE id = ${ticker.id}`;
      const activeCycle = await sql`SELECT id FROM "WheelCycle" WHERE "tickerId" = ${ticker.id} AND "completedAt" IS NULL`;
      if (activeCycle.length === 0) {
        await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${genId()}, ${ticker.id}, 'SELLING_PUTS', 0, 0, 0)`;
      }
      return NextResponse.json({ id: ticker.id, symbol: upperSymbol });
    }

    const tickerId = genId();
    const cycleId = genId();
    await sql`INSERT INTO "Ticker" (id, symbol, active, allocation, "strikePreference") VALUES (${tickerId}, ${upperSymbol}, true, ${alloc}, ${strikePref})`;
    await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${cycleId}, ${tickerId}, 'SELLING_PUTS', 0, 0, 0)`;

    return NextResponse.json({ id: tickerId, symbol: upperSymbol });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
