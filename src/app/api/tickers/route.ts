import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WheelStage, ContractStatus } from "@/lib/types";

export async function GET() {
  try {
    const tickers = await prisma.ticker.findMany({
      where: { active: true },
      include: {
        cycles: {
          where: { completedAt: null },
          include: {
            contracts: {
              where: {
                status: { in: [ContractStatus.OPEN, ContractStatus.PENDING] },
              },
            },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const result = tickers.map((t) => {
      const cycle = t.cycles[0];
      return {
        id: t.id,
        symbol: t.symbol,
        active: t.active,
        stage: cycle?.stage || null,
        totalPremium: cycle?.totalPremium || 0,
        costBasis: cycle?.costBasis,
        sharesHeld: cycle?.sharesHeld || 0,
        openContract: cycle?.contracts[0] || null,
        cycleId: cycle?.id || null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { symbol } = await request.json();

    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    const upperSymbol = symbol.toUpperCase().trim();

    // Check if already exists
    const existing = await prisma.ticker.findUnique({
      where: { symbol: upperSymbol },
    });

    if (existing) {
      // Reactivate if inactive
      if (!existing.active) {
        await prisma.ticker.update({
          where: { id: existing.id },
          data: { active: true },
        });
      }

      // Ensure there's an active cycle
      const activeCycle = await prisma.wheelCycle.findFirst({
        where: { tickerId: existing.id, completedAt: null },
      });

      if (!activeCycle) {
        await prisma.wheelCycle.create({
          data: {
            tickerId: existing.id,
            stage: WheelStage.SELLING_PUTS,
          },
        });
      }

      return NextResponse.json({ id: existing.id, symbol: upperSymbol });
    }

    // Create new ticker + initial cycle
    const ticker = await prisma.ticker.create({
      data: {
        symbol: upperSymbol,
        cycles: {
          create: {
            stage: WheelStage.SELLING_PUTS,
          },
        },
      },
    });

    return NextResponse.json({ id: ticker.id, symbol: ticker.symbol });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
