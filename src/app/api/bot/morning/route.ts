import { NextRequest, NextResponse } from "next/server";
import { runMorningCheck } from "@/lib/screener";
import { requireAdmin } from "@/lib/admin-guard";

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

  const result = await runMorningCheck();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const result = await runMorningCheck();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export const maxDuration = 60;
