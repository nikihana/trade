import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const body = await request.json();
    const upper = symbol.toUpperCase();

    if (body.allocation !== undefined) {
      await sql`UPDATE "Ticker" SET allocation = ${Number(body.allocation)} WHERE symbol = ${upper}`;
    }
    if (body.strikePreference !== undefined) {
      await sql`UPDATE "Ticker" SET "strikePreference" = ${body.strikePreference} WHERE symbol = ${upper}`;
    }
    if (body.active !== undefined) {
      await sql`UPDATE "Ticker" SET active = ${Boolean(body.active)} WHERE symbol = ${upper}`;
    }
    if (body.flaggedForReview !== undefined) {
      await sql`UPDATE "Ticker" SET "flaggedForReview" = ${Boolean(body.flaggedForReview)} WHERE symbol = ${upper}`;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    await sql`UPDATE "Ticker" SET active = false WHERE symbol = ${symbol.toUpperCase()}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
