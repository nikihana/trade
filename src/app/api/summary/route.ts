import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/alpaca";
import { ContractStatus } from "@/lib/types";

export async function GET() {
  try {
    const [account, activeCycles, allCycles, openContracts, recentTrades] =
      await Promise.all([
        getAccount(),
        prisma.wheelCycle.findMany({
          where: { completedAt: null },
          include: {
            ticker: true,
            contracts: {
              where: {
                status: {
                  in: [ContractStatus.OPEN, ContractStatus.PENDING],
                },
              },
            },
          },
        }),
        prisma.wheelCycle.findMany({
          select: { totalPremium: true, realizedPL: true },
        }),
        prisma.contract.count({
          where: {
            status: { in: [ContractStatus.OPEN, ContractStatus.PENDING] },
          },
        }),
        prisma.tradeLog.findMany({
          where: { level: "TRADE" },
          orderBy: { timestamp: "desc" },
          take: 20,
        }),
      ]);

    return NextResponse.json({
      account,
      activeCycles: activeCycles.map((c) => ({
        symbol: c.ticker.symbol,
        stage: c.stage,
        totalPremium: c.totalPremium,
        costBasis: c.costBasis,
        sharesHeld: c.sharesHeld,
        openContract: c.contracts[0] || null,
      })),
      totals: {
        totalPremium: allCycles.reduce((s, c) => s + c.totalPremium, 0),
        totalRealizedPL: allCycles.reduce((s, c) => s + c.realizedPL, 0),
        openContracts,
      },
      recentTrades,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
