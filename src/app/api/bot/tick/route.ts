import { NextRequest, NextResponse } from "next/server";
import { runTickEngine } from "@/lib/tick-engine";

export async function POST(request: NextRequest) {
  let forceOverride = false;
  try {
    const body = await request.json();
    forceOverride = body?.override === true;
  } catch { /* no body or not JSON */ }

  const result = await runTickEngine({ override: forceOverride });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
