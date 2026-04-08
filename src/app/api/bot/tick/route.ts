import { NextResponse } from "next/server";
import { runTickEngine } from "@/lib/tick-engine";

export async function POST() {
  const result = await runTickEngine();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
