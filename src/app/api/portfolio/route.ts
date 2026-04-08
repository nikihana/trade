import { NextResponse } from "next/server";
import { getAccount, getPositions } from "@/lib/alpaca";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const [account, positions, cycles] = await Promise.all([
      getAccount(),
      getPositions(),
      sql`SELECT "totalPremium", "realizedPL" FROM "WheelCycle"`,
    ]);

    const totalPremium = cycles.reduce((s, c) => s + Number(c.totalPremium), 0);
    const totalRealizedPL = cycles.reduce((s, c) => s + Number(c.realizedPL), 0);

    return NextResponse.json({ account, positions, totalPremium, totalRealizedPL });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
