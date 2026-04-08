import { NextRequest, NextResponse } from "next/server";
import { runTickEngine } from "@/lib/tick-engine";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTickEngine();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export const maxDuration = 60;
