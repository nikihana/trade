import { NextResponse } from "next/server";
import { detectRegime } from "@/lib/regime";

export async function GET() {
  try {
    const result = await detectRegime();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
