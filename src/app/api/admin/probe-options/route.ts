import { NextRequest, NextResponse } from "next/server";
import { getLatestQuote, getOptionsContracts } from "@/lib/alpaca";
import { auth } from "@/lib/auth";
import { format, addDays } from "date-fns";

/**
 * GET /api/admin/probe-options?underlying=SPY[&secret=CRON_SECRET]
 *
 * THROWAWAY DIAGNOSTIC (PR2 spike). Probes whether Alpaca returns greeks +
 * implied_volatility on our current data feed, across ITM/ATM/OTM strikes and
 * 0DTE / weekly / monthly expiries. Returns raw JSON for the probe report.
 *
 * Auth: admin session OR ?secret=CRON_SECRET (read-only market data).
 * Remove this endpoint once the feed question is settled.
 */

const DATA_URL = "https://data.alpaca.markets";

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY || "",
  };
}

async function fetchSnapshots(underlying: string, feed: string, symbols?: string[]) {
  const params = new URLSearchParams({ feed });
  if (symbols && symbols.length > 0) params.set("symbols", symbols.join(","));
  params.set("limit", "100");
  const url = `${DATA_URL}/v1beta1/options/snapshots/${encodeURIComponent(underlying)}?${params.toString()}`;
  const res = await fetch(url, { headers: headers() });
  const body = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(body); } catch { /* keep raw */ }
  return { status: res.status, ok: res.ok, url, json: json ?? body };
}

export async function GET(request: NextRequest) {
  // Auth: admin session or cron secret
  const secret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  let authed = false;
  if (cronSecret && secret === cronSecret) authed = true;
  if (!authed) {
    const session = await auth();
    if (session?.user?.isAdmin) authed = true;
  }
  if (!authed) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const underlying = (request.nextUrl.searchParams.get("underlying") || "SPY").toUpperCase();

  try {
    const quote = await getLatestQuote(underlying);
    const spot = quote.lastPrice;

    const today = new Date();
    // Expiry buckets
    const buckets: { label: string; gte: string; lte: string }[] = [
      { label: "near_0dte", gte: format(today, "yyyy-MM-dd"), lte: format(addDays(today, 3), "yyyy-MM-dd") },
      { label: "weekly", gte: format(addDays(today, 5), "yyyy-MM-dd"), lte: format(addDays(today, 10), "yyyy-MM-dd") },
      { label: "monthly", gte: format(addDays(today, 25), "yyyy-MM-dd"), lte: format(addDays(today, 40), "yyyy-MM-dd") },
    ];

    const selected: { bucket: string; itm?: string; atm?: string; otm?: string; expiry?: string }[] = [];
    const allSymbols: string[] = [];

    for (const b of buckets) {
      // Pull puts within ±15% of spot for this expiry window
      const contracts = await getOptionsContracts(underlying, {
        type: "put",
        expiration_date_gte: b.gte,
        expiration_date_lte: b.lte,
        strike_price_gte: String(Math.floor(spot * 0.85)),
        strike_price_lte: String(Math.ceil(spot * 1.15)),
        limit: 100,
      });
      if (contracts.length === 0) {
        selected.push({ bucket: b.label });
        continue;
      }
      // Use the earliest expiry available in the window
      const expiry = contracts.sort((a, b2) => a.expirationDate.localeCompare(b2.expirationDate))[0].expirationDate;
      const inExpiry = contracts.filter((c) => c.expirationDate === expiry);
      // For a PUT: ITM = strike > spot, OTM = strike < spot, ATM = closest
      const sortedByCloseness = [...inExpiry].sort(
        (a, b2) => Math.abs(a.strikePrice - spot) - Math.abs(b2.strikePrice - spot)
      );
      const atm = sortedByCloseness[0];
      const itm = [...inExpiry].filter((c) => c.strikePrice > spot).sort((a, b2) => a.strikePrice - b2.strikePrice)[0];
      const otm = [...inExpiry].filter((c) => c.strikePrice < spot).sort((a, b2) => b2.strikePrice - a.strikePrice)[0];
      const pick = { bucket: b.label, expiry, itm: itm?.symbol, atm: atm?.symbol, otm: otm?.symbol };
      selected.push(pick);
      for (const s of [itm?.symbol, atm?.symbol, otm?.symbol]) if (s) allSymbols.push(s);
    }

    // Fetch snapshots across feeds to see which returns greeks/IV
    const feeds = ["indicative", "opra"];
    const snapshotsByFeed: Record<string, unknown> = {};
    for (const feed of feeds) {
      snapshotsByFeed[feed] = await fetchSnapshots(underlying, feed, allSymbols);
    }

    return NextResponse.json({
      underlying,
      spot,
      generatedAt: new Date().toISOString(),
      selectedContracts: selected,
      snapshotsByFeed,
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error", underlying },
      { status: 500 }
    );
  }
}
