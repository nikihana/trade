import { sql } from "@/lib/db";
import { getAccount, getPositions } from "@/lib/alpaca";
import { logInfo } from "@/lib/logger";
import { formatCurrency } from "@/lib/utils";

export async function generateDailySummary(): Promise<string> {
  const account = await getAccount();
  const positions = await getPositions();

  const activeCycles = await sql`
    SELECT wc.*, t.symbol FROM "WheelCycle" wc
    JOIN "Ticker" t ON t.id = wc."tickerId"
    WHERE wc."completedAt" IS NULL
  `;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTrades = await sql`SELECT * FROM "TradeLog" WHERE level = 'TRADE' AND timestamp >= ${today} ORDER BY timestamp ASC`;

  const allCycles = await sql`SELECT "totalPremium", "realizedPL" FROM "WheelCycle"`;
  const totalPremium = allCycles.reduce((s, c) => s + Number(c.totalPremium), 0);
  const totalRealizedPL = allCycles.reduce((s, c) => s + Number(c.realizedPL), 0);

  const openContractsResult = await sql`SELECT count(*)::int as count FROM "Contract" WHERE status IN ('OPEN', 'PENDING')`;

  const lines = [
    "═══════════════════════════════",
    "   DAILY WHEEL STRATEGY SUMMARY",
    `   ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`,
    "═══════════════════════════════",
    "",
    `Cash: ${formatCurrency(account.cash)} | Equity: ${formatCurrency(account.equity)}`,
    "",
    ...activeCycles.map((c) => `${c.symbol}: ${c.stage} | Premium: ${formatCurrency(Number(c.totalPremium))}`),
    "",
    `Open Contracts: ${openContractsResult[0].count}`,
    `Total Premium: ${formatCurrency(totalPremium)}`,
    `Realized P&L: ${formatCurrency(totalRealizedPL)}`,
    "",
    `Today's Trades: ${todayTrades.length}`,
    ...todayTrades.map((t) => `  • ${t.message}`),
  ];

  const summary = lines.join("\n");
  await logInfo(summary);
  return summary;
}
