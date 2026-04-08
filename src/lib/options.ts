import { addWeeks, nextFriday, format, isFriday } from "date-fns";
import { getOptionsContracts, getLatestQuote } from "./alpaca";
import type { AlpacaOptionContract } from "./types";

// ── Strike Selection ─────────────────────────────────────

/**
 * Find the best put strike ~10% below current price
 */
export function targetPutStrike(currentPrice: number): number {
  return Math.round(currentPrice * 0.9);
}

/**
 * Find the best call strike ~10% above cost basis
 */
export function targetCallStrike(costBasis: number): number {
  const target = costBasis * 1.1;
  return Math.ceil(target);
}

// ── Expiration Selection ─────────────────────────────────

/**
 * Find the nearest Friday 2-4 weeks out (options typically expire on Fridays)
 */
export function targetExpiration(now: Date = new Date()): {
  minDate: string;
  maxDate: string;
  targetDate: string;
} {
  const twoWeeks = addWeeks(now, 2);
  const fourWeeks = addWeeks(now, 4);
  const threeWeeks = addWeeks(now, 3);

  // Target: the Friday closest to 3 weeks out
  let target = isFriday(threeWeeks) ? threeWeeks : nextFriday(threeWeeks);

  // Clamp to range
  const minFriday = isFriday(twoWeeks) ? twoWeeks : nextFriday(twoWeeks);
  const maxFriday = isFriday(fourWeeks) ? fourWeeks : nextFriday(fourWeeks);

  if (target < minFriday) target = minFriday;
  if (target > maxFriday) target = maxFriday;

  return {
    minDate: format(minFriday, "yyyy-MM-dd"),
    maxDate: format(maxFriday, "yyyy-MM-dd"),
    targetDate: format(target, "yyyy-MM-dd"),
  };
}

// ── Find Best Contract ───────────────────────────────────

/**
 * Find the best put contract for the wheel strategy
 */
export async function findBestPut(
  symbol: string
): Promise<AlpacaOptionContract | null> {
  const quote = await getLatestQuote(symbol);
  const strike = targetPutStrike(quote.lastPrice);
  const { minDate, maxDate } = targetExpiration();

  const contracts = await getOptionsContracts(symbol, {
    type: "put",
    expiration_date_gte: minDate,
    expiration_date_lte: maxDate,
    strike_price_gte: String(strike - 5),
    strike_price_lte: String(strike + 5),
  });

  if (contracts.length === 0) return null;

  // Pick the one closest to our target strike
  contracts.sort(
    (a, b) =>
      Math.abs(a.strikePrice - strike) - Math.abs(b.strikePrice - strike)
  );

  return contracts[0];
}

/**
 * Find the best call contract for covered calls
 */
export async function findBestCall(
  symbol: string,
  costBasis: number
): Promise<AlpacaOptionContract | null> {
  const strike = targetCallStrike(costBasis);
  const { minDate, maxDate } = targetExpiration();

  const contracts = await getOptionsContracts(symbol, {
    type: "call",
    expiration_date_gte: minDate,
    expiration_date_lte: maxDate,
    strike_price_gte: String(strike - 5),
    strike_price_lte: String(strike + 5),
  });

  if (contracts.length === 0) return null;

  // Pick the one closest to target strike, but never below cost basis
  const valid = contracts.filter((c) => c.strikePrice >= costBasis);
  if (valid.length === 0) return null;

  valid.sort(
    (a, b) =>
      Math.abs(a.strikePrice - strike) - Math.abs(b.strikePrice - strike)
  );

  return valid[0];
}

/**
 * Get the current price for a symbol
 */
export async function getCurrentPrice(symbol: string): Promise<number> {
  const quote = await getLatestQuote(symbol);
  return quote.lastPrice;
}
