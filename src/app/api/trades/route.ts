import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const ticker = searchParams.get("ticker");
    const level = searchParams.get("level");
    const offset = (page - 1) * limit;

    let trades, total;

    if (ticker && level) {
      trades = await sql`SELECT * FROM "TradeLog" WHERE ticker = ${ticker.toUpperCase()} AND level = ${level} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
      const countResult = await sql`SELECT count(*)::int as count FROM "TradeLog" WHERE ticker = ${ticker.toUpperCase()} AND level = ${level}`;
      total = countResult[0].count;
    } else if (ticker) {
      trades = await sql`SELECT * FROM "TradeLog" WHERE ticker = ${ticker.toUpperCase()} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
      const countResult = await sql`SELECT count(*)::int as count FROM "TradeLog" WHERE ticker = ${ticker.toUpperCase()}`;
      total = countResult[0].count;
    } else if (level) {
      trades = await sql`SELECT * FROM "TradeLog" WHERE level = ${level} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
      const countResult = await sql`SELECT count(*)::int as count FROM "TradeLog" WHERE level = ${level}`;
      total = countResult[0].count;
    } else {
      trades = await sql`SELECT * FROM "TradeLog" ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
      const countResult = await sql`SELECT count(*)::int as count FROM "TradeLog"`;
      total = countResult[0].count;
    }

    return NextResponse.json({ trades, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
