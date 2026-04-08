import { prisma } from "@/lib/db";
import { getAccount, getPositions } from "@/lib/alpaca";
import { logInfo } from "@/lib/logger";
import { formatCurrency } from "@/lib/utils";
import { ContractStatus } from "@/lib/types";

/**
 * Generate a daily summary at market close
 */
export async function generateDailySummary(): Promise<string> {
  const account = await getAccount();
  const positions = await getPositions();

  // Get all active cycles
  const activeCycles = await prisma.wheelCycle.findMany({
    where: { completedAt: null },
    include: {
      ticker: true,
      contracts: true,
    },
  });

  // Get today's trades
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTrades = await prisma.tradeLog.findMany({
    where: {
      level: "TRADE",
      timestamp: { gte: today },
    },
    orderBy: { timestamp: "asc" },
  });

  // Get all-time premium
  const allCycles = await prisma.wheelCycle.findMany({
    select: { totalPremium: true, realizedPL: true },
  });
  const totalPremiumAllTime = allCycles.reduce(
    (sum, c) => sum + c.totalPremium,
    0
  );
  const totalRealizedPL = allCycles.reduce(
    (sum, c) => sum + c.realizedPL,
    0
  );

  // Get open contract count
  const openContracts = await prisma.contract.count({
    where: { status: { in: [ContractStatus.OPEN, ContractStatus.PENDING] } },
  });

  const lines: string[] = [
    "═══════════════════════════════════════",
    "       DAILY WHEEL STRATEGY SUMMARY",
    `       ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`,
    "═══════════════════════════════════════",
    "",
    "📊 ACCOUNT",
    `   Cash:           ${formatCurrency(account.cash)}`,
    `   Equity:         ${formatCurrency(account.equity)}`,
    `   Buying Power:   ${formatCurrency(account.buyingPower)}`,
    "",
    "📈 POSITIONS",
  ];

  if (positions.length === 0) {
    lines.push("   No stock positions");
  } else {
    for (const p of positions) {
      lines.push(
        `   ${p.symbol}: ${p.qty} shares @ ${formatCurrency(p.avgEntryPrice)} | P&L: ${formatCurrency(p.unrealizedPL)}`
      );
    }
  }

  lines.push("", "🎯 ACTIVE WHEELS");
  for (const cycle of activeCycles) {
    const openContract = cycle.contracts.find((c) =>
      [ContractStatus.OPEN, ContractStatus.PENDING].includes(
        c.status as ContractStatus
      )
    );
    lines.push(
      `   ${cycle.ticker.symbol}: Stage=${cycle.stage} | Premium=${formatCurrency(cycle.totalPremium)}${openContract ? ` | Open: ${openContract.type} $${openContract.strikePrice} exp ${new Date(openContract.expiration).toLocaleDateString()}` : ""}`
    );
  }

  lines.push(
    "",
    "💰 TOTALS",
    `   Open Contracts:     ${openContracts}`,
    `   Premium (All-Time): ${formatCurrency(totalPremiumAllTime)}`,
    `   Realized P&L:       ${formatCurrency(totalRealizedPL)}`,
    "",
    `📝 TODAY'S TRADES: ${todayTrades.length}`,
  );

  for (const trade of todayTrades) {
    lines.push(`   • ${trade.message}`);
  }

  lines.push("═══════════════════════════════════════");

  const summary = lines.join("\n");
  await logInfo(summary);
  return summary;
}
