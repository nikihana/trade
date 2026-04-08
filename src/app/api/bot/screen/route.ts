import { NextRequest, NextResponse } from "next/server";
import { runWeeklyScreen } from "@/lib/screener";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.nextUrl.searchParams.get("secret")
      || request.headers.get("authorization")?.replace("Bearer ", "")
      || request.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runWeeklyScreen();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

// Also allow POST for the dashboard test button
export async function POST() {
  const result = await runWeeklyScreen();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export const maxDuration = 60;
