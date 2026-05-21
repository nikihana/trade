import { NextResponse } from "next/server";
import { sql, genId } from "@/lib/db";
import { getAccount } from "@/lib/alpaca";
import { requireAdmin } from "@/lib/admin-guard";

// Allocation weights by yield rank (1-based index)
const YIELD_WEIGHTS = [0.30, 0.25, 0.20, 0.15, 0.10];

function computeAllocation(
  equity: number,
  yieldRank: number,
  suggestedStrike: number
): number {
  const pool = equity * 0.70;
  const weight = YIELD_WEIGHTS[yieldRank - 1] ?? 0.10;
  const raw = pool * weight;
  const capped = Math.min(raw, equity * 0.20);
  const rankAlloc = Math.floor(capped / 1000) * 1000;

  // Guarantee the allocation can secure at least one contract, plus a 5%
  // buffer for price drift between screen time and trade time. Without this,
  // expensive names (e.g. NVDA at a $200 strike = $20k/contract) get funded
  // below one contract's collateral and sit permanently BLOCKED.
  const contractCost = suggestedStrike * 100;
  const minToTrade = Math.ceil((contractCost * 1.05) / 1000) * 1000;

  return Math.max(rankAlloc, minToTrade);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;

    const rows = await sql`SELECT * FROM "Candidate" WHERE id = ${id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    const candidate = rows[0];
    if (candidate.status !== "proposed") {
      return NextResponse.json(
        { error: `Candidate is already ${candidate.status}` },
        { status: 400 }
      );
    }

    const account = await getAccount();
    const yieldRank = Number(candidate.yieldRank) || 1;
    const suggestedStrike = Number(candidate.suggestedStrike) || 0;
    const allocation = computeAllocation(account.equity, yieldRank, suggestedStrike);

    const symbol = String(candidate.symbol);

    // Upsert Ticker — reactivate if it exists, create fresh if not
    const existing = await sql`SELECT id, active FROM "Ticker" WHERE symbol = ${symbol}`;
    if (existing.length > 0) {
      await sql`UPDATE "Ticker" SET active = true, allocation = ${allocation}, "flaggedForReview" = false WHERE symbol = ${symbol}`;
      // Ensure an active cycle exists
      const activeCycle = await sql`SELECT id FROM "WheelCycle" WHERE "tickerId" = ${existing[0].id} AND "completedAt" IS NULL`;
      if (activeCycle.length === 0) {
        await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${genId()}, ${existing[0].id}, 'SELLING_PUTS', 0, 0, 0)`;
      }
    } else {
      const tickerId = genId();
      const cycleId = genId();
      await sql`INSERT INTO "Ticker" (id, symbol, active, allocation, "strikePreference") VALUES (${tickerId}, ${symbol}, true, ${allocation}, '30-delta')`;
      await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${cycleId}, ${tickerId}, 'SELLING_PUTS', 0, 0, 0)`;
    }

    await sql`UPDATE "Candidate" SET status = 'approved' WHERE id = ${id}`;

    await sql`INSERT INTO "TradeLog" (id, timestamp, level, message, data) VALUES (${genId()}, now(), 'INFO', ${`APPROVED: ${symbol} | Rank #${yieldRank} | Allocation: $${allocation.toLocaleString()} | Equity: $${account.equity.toFixed(0)}`}, ${JSON.stringify({ symbol, yieldRank, allocation, equity: account.equity })})`;

    return NextResponse.json({ symbol, allocation, yieldRank });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
