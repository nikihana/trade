import type {
  AlpacaAccount,
  AlpacaPosition,
  AlpacaOptionContract,
} from "./types";

const BASE_URL =
  process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
const DATA_URL = "https://data.alpaca.markets";

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY || "",
    "Content-Type": "application/json",
  };
}

async function api<T>(
  url: string,
  options?: RequestInit,
  baseUrl = BASE_URL
): Promise<T> {
  const res = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: { ...headers(), ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Account ──────────────────────────────────────────────

export async function getAccount(): Promise<AlpacaAccount> {
  const data = await api<Record<string, string>>("/v2/account");
  return {
    id: data.id,
    cash: parseFloat(data.cash),
    buyingPower: parseFloat(data.buying_power),
    optionsBuyingPower: parseFloat(data.options_buying_power || data.buying_power),
    equity: parseFloat(data.equity),
    portfolioValue: parseFloat(data.portfolio_value),
  };
}

// ── Positions ────────────────────────────────────────────

export async function getPositions(): Promise<AlpacaPosition[]> {
  const data = await api<Record<string, string>[]>("/v2/positions");
  return data.map((p) => ({
    symbol: p.symbol,
    qty: parseInt(p.qty),
    avgEntryPrice: parseFloat(p.avg_entry_price),
    currentPrice: parseFloat(p.current_price),
    marketValue: parseFloat(p.market_value),
    unrealizedPL: parseFloat(p.unrealized_pl),
  }));
}

// ── Historical Bars ──────────────────────────────────────

export async function getHistoricalBars(
  symbol: string,
  params: { timeframe?: string; limit?: number } = {}
): Promise<
  { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[]
> {
  const timeframe = params.timeframe || "1Day";
  const limit = params.limit || 60;
  const data = await api<{
    bars: { t: string; o: number; h: number; l: number; c: number; v: number }[];
  }>(
    `/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}&sort=asc`,
    undefined,
    DATA_URL
  );
  return (data.bars || []).map((b) => ({
    timestamp: b.t,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));
}

// ── Latest Quote ─────────────────────────────────────────

export async function getLatestQuote(
  symbol: string
): Promise<{ lastPrice: number; bidPrice: number; askPrice: number }> {
  const data = await api<Record<string, Record<string, number>>>(
    `/v2/stocks/${symbol}/quotes/latest`,
    undefined,
    DATA_URL
  );
  const quote = data.quote;
  return {
    lastPrice: (quote.ap + quote.bp) / 2, // midpoint
    bidPrice: quote.bp,
    askPrice: quote.ap,
  };
}

// ── Options Chain ────────────────────────────────────────

export async function getOptionsContracts(
  underlyingSymbol: string,
  params: {
    type?: "call" | "put";
    expiration_date_gte?: string;
    expiration_date_lte?: string;
    strike_price_gte?: string;
    strike_price_lte?: string;
    limit?: number;
  } = {}
): Promise<AlpacaOptionContract[]> {
  const searchParams = new URLSearchParams({
    underlying_symbols: underlyingSymbol,
    status: "active",
    limit: String(params.limit || 100),
  });
  if (params.type) searchParams.set("type", params.type);
  if (params.expiration_date_gte)
    searchParams.set("expiration_date_gte", params.expiration_date_gte);
  if (params.expiration_date_lte)
    searchParams.set("expiration_date_lte", params.expiration_date_lte);
  if (params.strike_price_gte)
    searchParams.set("strike_price_gte", params.strike_price_gte);
  if (params.strike_price_lte)
    searchParams.set("strike_price_lte", params.strike_price_lte);

  const data = await api<{
    option_contracts: Record<string, string | number>[];
  }>(`/v2/options/contracts?${searchParams.toString()}`);

  return (data.option_contracts || []).map((c) => ({
    id: String(c.id),
    symbol: String(c.symbol),
    name: String(c.name),
    type: String(c.type) as "call" | "put",
    strikePrice: Number(c.strike_price),
    expirationDate: String(c.expiration_date),
    openInterest: Number(c.open_interest || 0),
    status: String(c.status),
  }));
}

// ── Liquidate Position ───────────────────────────────────

export async function liquidatePosition(symbolOrAssetId: string) {
  return api<Record<string, unknown>>(
    `/v2/positions/${encodeURIComponent(symbolOrAssetId)}`,
    { method: "DELETE" }
  );
}

// ── Orders ───────────────────────────────────────────────

interface OrderParams {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit";
  time_in_force: "day" | "gtc";
  limit_price?: number;
  order_class?: string;
}

// Alpaca rejects option limit_price values with more than 2 decimals (422 42210000)
function roundLimitPrice<T extends { limit_price?: number }>(p: T): T {
  if (p.limit_price !== undefined) {
    return { ...p, limit_price: Number(p.limit_price.toFixed(2)) };
  }
  return p;
}

export async function submitOrder(params: OrderParams) {
  return api<Record<string, unknown>>("/v2/orders", {
    method: "POST",
    body: JSON.stringify(roundLimitPrice(params)),
  });
}

export async function getOrder(orderId: string) {
  return api<Record<string, unknown>>(`/v2/orders/${orderId}`);
}

export async function getOrders(
  status: "open" | "closed" | "all" = "all",
  limit = 50
) {
  return api<Record<string, unknown>[]>(
    `/v2/orders?status=${status}&limit=${limit}`
  );
}

export async function cancelOrder(orderId: string) {
  return api<void>(`/v2/orders/${orderId}`, { method: "DELETE" });
}

// ── Account Activities ───────────────────────────────────

export interface AlpacaActivity {
  id: string;
  activity_type: string;
  transaction_time?: string;
  date?: string;
  type?: string;
  // Trade fields (FILL)
  price?: string;
  qty?: string;
  side?: "buy" | "sell";
  symbol?: string;
  order_id?: string;
  // Non-trade fields
  net_amount?: string;
  description?: string;
  // Catch-all
  [key: string]: unknown;
}

/**
 * Pull every account activity from Alpaca with full pagination.
 * Used by the account-level audit endpoint.
 */
export async function getAccountActivities(
  activityTypes?: string[]
): Promise<AlpacaActivity[]> {
  const all: AlpacaActivity[] = [];
  let pageToken: string | undefined;
  // Defensive cap so we never spin forever if pagination misbehaves
  for (let i = 0; i < 200; i++) {
    const params = new URLSearchParams();
    params.set("page_size", "100");
    if (activityTypes && activityTypes.length > 0) {
      params.set("activity_types", activityTypes.join(","));
    }
    if (pageToken) params.set("page_token", pageToken);

    const batch = await api<AlpacaActivity[]>(`/v2/account/activities?${params.toString()}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break; // last page
    // Alpaca paginates by passing the last id of the previous page
    pageToken = String(batch[batch.length - 1].id);
  }
  return all;
}

// ── Options Orders ───────────────────────────────────────

export async function submitOptionOrder(params: {
  symbol: string; // OCC symbol
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit";
  time_in_force: "day" | "gtc";
  limit_price?: number;
}) {
  return api<Record<string, unknown>>("/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      ...roundLimitPrice(params),
      asset_class: "us_option",
    }),
  });
}

// ── Multi-Leg Orders (Spreads) ───────────────────────────

export async function submitMultiLegOrder(params: {
  legs: {
    symbol: string;
    ratio_qty: number;
    side: "buy" | "sell";
    position_intent: "buy_to_open" | "sell_to_open" | "buy_to_close" | "sell_to_close";
  }[];
  type: "market" | "limit";
  time_in_force: "day" | "gtc";
  limit_price?: number;
}) {
  return api<Record<string, unknown>>("/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      order_class: "mleg",
      legs: params.legs,
      type: params.type,
      time_in_force: params.time_in_force,
      ...(params.limit_price !== undefined && { limit_price: Number(params.limit_price.toFixed(2)) }),
    }),
  });
}

// ── Option Quote ─────────────────────────────────────────

/**
 * Fetch latest option quote. Throws on any failure — never returns silent zeros.
 * Callers must handle the throw and decide whether to skip, drop, or surface the error.
 * A quote with bp=0 AND ap=0 is treated as a failure (no real market on this contract).
 */
export async function getOptionQuote(
  optionSymbol: string
): Promise<{ bidPrice: number; askPrice: number; midPrice: number }> {
  let data: { quotes?: Record<string, { bp?: number; ap?: number }> };
  try {
    data = await api<{ quotes?: Record<string, { bp?: number; ap?: number }> }>(
      `/v1beta1/options/quotes/latest?symbols=${encodeURIComponent(optionSymbol)}&feed=indicative`,
      undefined,
      DATA_URL
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Quote fetch failed for ${optionSymbol}: ${msg}`);
  }

  const quote = Object.values(data.quotes || {})[0];
  if (!quote) {
    throw new Error(`No quote data for ${optionSymbol}`);
  }

  const bp = quote.bp || 0;
  const ap = quote.ap || 0;
  if (bp === 0 && ap === 0) {
    throw new Error(`No bid/ask available for ${optionSymbol} (illiquid or expired)`);
  }

  return { bidPrice: bp, askPrice: ap, midPrice: (bp + ap) / 2 };
}
