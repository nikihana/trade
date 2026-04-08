import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // Read bot status file
    let botStatus = { running: false, lastCheck: null, nextCheck: null };
    try {
      const statusFile = join(process.cwd(), "bot-status.json");
      const raw = readFileSync(statusFile, "utf-8");
      botStatus = JSON.parse(raw);
    } catch {
      // Bot hasn't started yet
    }

    const activeTickers = await prisma.ticker.count({ where: { active: true } });

    return NextResponse.json({
      ...botStatus,
      activeTickers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
