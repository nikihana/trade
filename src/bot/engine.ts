import { sql } from "@/lib/db";
import { handleSellPut } from "./stage-puts";
import { handleSellCall } from "./stage-calls";
import { monitorPositions } from "./monitor";
import { logInfo, logError } from "@/lib/logger";
import { genId } from "@/lib/db";

export async function runTick(): Promise<void> {
  logInfo("── Bot tick starting ──");

  try {
    await monitorPositions();

    const tickers = await sql`
      SELECT t.*, wc.id as "cycleId", wc.stage, wc."costBasis"
      FROM "Ticker" t
      LEFT JOIN "WheelCycle" wc ON wc."tickerId" = t.id AND wc."completedAt" IS NULL
      WHERE t.active = true
    `;

    for (const ticker of tickers) {
      const symbol = ticker.symbol as string;
      let cycleId = ticker.cycleId as string | null;

      if (!cycleId) {
        cycleId = genId();
        await sql`INSERT INTO "WheelCycle" (id, "tickerId", stage, "totalPremium", "realizedPL", "sharesHeld") VALUES (${cycleId}, ${ticker.id}, 'SELLING_PUTS', 0, 0, 0)`;
        logInfo("Created new wheel cycle", symbol);
      }

      const open = await sql`SELECT id, type FROM "Contract" WHERE "cycleId" = ${cycleId} AND status IN ('OPEN', 'PENDING')`;
      if (open.length > 0) {
        logInfo(`Open ${open[0].type} contract exists, monitoring only`, symbol);
        continue;
      }

      const stage = (ticker.stage as string) || "SELLING_PUTS";

      if (stage === "SELLING_PUTS") {
        await handleSellPut(ticker.id as string, symbol, cycleId);
      } else if (stage === "SELLING_CALLS" && ticker.costBasis) {
        await handleSellCall(ticker.id as string, symbol, cycleId, Number(ticker.costBasis));
      }
    }

    logInfo("── Bot tick complete ──");
  } catch (error) {
    logError(`Bot tick failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
