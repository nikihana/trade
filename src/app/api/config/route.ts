import { NextRequest, NextResponse } from "next/server";
import { getAllConfig, setConfig } from "@/lib/config";

export async function GET() {
  try {
    const config = await getAllConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const updates: { key: string; value: string }[] = await request.json();

    for (const { key, value } of updates) {
      await setConfig(key, value);
    }

    const config = await getAllConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
