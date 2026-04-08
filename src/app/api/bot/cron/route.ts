import { NextRequest, NextResponse } from "next/server";
import { runTickEngine } from "@/lib/tick-engine";

/**
 * GET /api/bot/cron?secret=YOUR_SECRET
 *
 * Called by external cron service (cron-job.org) every 15 min during market hours.
 * Accepts secret via:
 *   - Query param: ?secret=YOUR_SECRET
 *   - Header: Authorization: Bearer YOUR_SECRET
 *   - Header: x-cron-secret: YOUR_SECRET
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const querySecret = request.nextUrl.searchParams.get("secret");
  const bearerSecret = request.headers.get("authorization")?.replace("Bearer ", "");
  const headerSecret = request.headers.get("x-cron-secret");

  const provided = querySecret || bearerSecret || headerSecret;

  if (provided !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTickEngine();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export const maxDuration = 60;
