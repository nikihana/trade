import { NextRequest, NextResponse } from "next/server";
import { getOptionsContracts } from "@/lib/alpaca";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const searchParams = request.nextUrl.searchParams;

    const contracts = await getOptionsContracts(symbol.toUpperCase(), {
      type: (searchParams.get("type") as "call" | "put") || undefined,
      expiration_date_gte: searchParams.get("exp_gte") || undefined,
      expiration_date_lte: searchParams.get("exp_lte") || undefined,
      strike_price_gte: searchParams.get("strike_gte") || undefined,
      strike_price_lte: searchParams.get("strike_lte") || undefined,
      limit: parseInt(searchParams.get("limit") || "50"),
    });

    return NextResponse.json(contracts);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
