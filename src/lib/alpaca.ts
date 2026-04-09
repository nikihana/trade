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
    `/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}`,
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

export async function submitOrder(params: OrderParams) {
  return api<Record<string, unknown>>("/v2/orders", {
    method: "POST",
    body: JSON.stringify(params),
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
      ...params,
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
      ...(params.limit_price && { limit_price: params.limit_price }),
    }),
  });
}

// ── Option Quote ─────────────────────────────────────────

export async function getOptionQuote(
  optionSymbol: string
): Promise<{ bidPrice: number; askPrice: number; midPrice: number }> {
  try {
    const data = await api<{ quotes?: Record<string, { bp?: number; ap?: number }> }>(
      `/v1beta1/options/quotes/latest?symbols=${encodeURIComponent(optionSymbol)}&feed=indicative`,
      undefined,
      DATA_URL
    );
    const quote = Object.values(data.quotes || {})[0];
    if (!quote) throw new Error("No quote data");
    const bp = quote.bp || 0;
    const ap = quote.ap || 0;
    return {
      bidPrice: bp,
      askPrice: ap,
      midPrice: (bp + ap) / 2,
    };
  } catch {
    return { bidPrice: 0, askPrice: 0, midPrice: 0 };
  }
}
