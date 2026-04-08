import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    const ticker = await prisma.ticker.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!ticker) {
      return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
    }

    const cycles = await prisma.wheelCycle.findMany({
      where: { tickerId: ticker.id },
      include: {
        contracts: { orderBy: { openedAt: "desc" } },
      },
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json(cycles);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
