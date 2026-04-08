import { addWeeks, nextFriday, format, isFriday } from "date-fns";
import { getOptionsContracts, getLatestQuote } from "./alpaca";
import { getConfigNum } from "./config";
import type { AlpacaOptionContract } from "./types";

// ── Strike Selection ─────────────────────────────────────

export async function targetPutStrike(currentPrice: number): Promise<number> {
  const pct = await getConfigNum("put_strike_pct", 0.10);
  return Math.round(currentPrice * (1 - pct));
}

export async function targetCallStrike(costBasis: number): Promise<number> {
  const pct = await getConfigNum("call_strike_pct", 0.10);
  const target = costBasis * (1 + pct);
  return Math.ceil(target);
}

// ── Expiration Selection ─────────────────────────────────

export async function targetExpiration(now: Date = new Date()): Promise<{
  minDate: string;
  maxDate: string;
  targetDate: string;
}> {
  const minWeeks = await getConfigNum("min_expiration_weeks", 2);
  const maxWeeks = await getConfigNum("max_expiration_weeks", 4);
  const targetWeeks = await getConfigNum("target_expiration_weeks", 3);

  const minOut = addWeeks(now, minWeeks);
  const maxOut = addWeeks(now, maxWeeks);
  const targetOut = addWeeks(now, targetWeeks);

  let target = isFriday(targetOut) ? targetOut : nextFriday(targetOut);
  const minFriday = isFriday(minOut) ? minOut : nextFriday(minOut);
  const maxFriday = isFriday(maxOut) ? maxOut : nextFriday(maxOut);

  if (target < minFriday) target = minFriday;
  if (target > maxFriday) target = maxFriday;

  return {
    minDate: format(minFriday, "yyyy-MM-dd"),
    maxDate: format(maxFriday, "yyyy-MM-dd"),
    targetDate: format(target, "yyyy-MM-dd"),
  };
}

// ── Find Best Contract ───────────────────────────────────

export async function findBestPut(
  symbol: string
): Promise<AlpacaOptionContract | null> {
  const quote = await getLatestQuote(symbol);
  const strike = await targetPutStrike(quote.lastPrice);
  const { minDate, maxDate } = await targetExpiration();
  const range = await getConfigNum("strike_range", 5);

  const contracts = await getOptionsContracts(symbol, {
    type: "put",
    expiration_date_gte: minDate,
    expiration_date_lte: maxDate,
    strike_price_gte: String(strike - range),
    strike_price_lte: String(strike + range),
  });

  if (contracts.length === 0) return null;

  contracts.sort(
    (a, b) =>
      Math.abs(a.strikePrice - strike) - Math.abs(b.strikePrice - strike)
  );

  return contracts[0];
}

export async function findBestCall(
  symbol: string,
  costBasis: number
): Promise<AlpacaOptionContract | null> {
  const strike = await targetCallStrike(costBasis);
  const { minDate, maxDate } = await targetExpiration();
  const range = await getConfigNum("strike_range", 5);

  const contracts = await getOptionsContracts(symbol, {
    type: "call",
    expiration_date_gte: minDate,
    expiration_date_lte: maxDate,
    strike_price_gte: String(strike - range),
    strike_price_lte: String(strike + range),
  });

  if (contracts.length === 0) return null;

  const valid = contracts.filter((c) => c.strikePrice >= costBasis);
  if (valid.length === 0) return null;

  valid.sort(
    (a, b) =>
      Math.abs(a.strikePrice - strike) - Math.abs(b.strikePrice - strike)
  );

  return valid[0];
}

export async function getCurrentPrice(symbol: string): Promise<number> {
  const quote = await getLatestQuote(symbol);
  return quote.lastPrice;
}
