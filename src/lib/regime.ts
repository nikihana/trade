import { getHistoricalBars, getLatestQuote } from "./alpaca";
import { getConfigNum } from "./config";
import { fetchVix } from "./vix";
import { MarketRegime } from "./types";
import type { RegimeResult } from "./types";

/**
 * Detect the current market regime based on SPY technicals and VIX.
 * Called at the start of every tick before any trades.
 */
export async function detectRegime(): Promise<RegimeResult> {
  const vixHaltThreshold = await getConfigNum("vix_halt_threshold", 30);
  const bearDropPct = await getConfigNum("bear_drop_pct", 0.20);

  // Fetch data in parallel
  let bars: { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
  let vix = 20;

  try {
    [bars, vix] = await Promise.all([
      getHistoricalBars("SPY", { limit: 260 }),
      fetchVix(),
    ]);
  } catch {
    vix = await fetchVix();
  }

  // SPY price — use bars if available, fallback to live quote
  let spyPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
  if (spyPrice === 0) {
    try {
      const q = await getLatestQuote("SPY");
      spyPrice = q.lastPrice;
    } catch { /* leave at 0 */ }
  }

  const sma50 =
    bars.length >= 50
      ? bars.slice(-50).reduce((s, b) => s + b.close, 0) / 50
      : spyPrice; // not enough data, treat as at-price

  const sma200 =
    bars.length >= 200
      ? bars.slice(-200).reduce((s, b) => s + b.close, 0) / 200
      : 0; // 0 means skip 200MA check

  // 52-week high (from all bars)
  const spy52WeekHigh =
    bars.length > 0 ? Math.max(...bars.map((b) => b.high)) : spyPrice;

  const drawdownPct =
    spy52WeekHigh > 0 ? (spy52WeekHigh - spyPrice) / spy52WeekHigh : 0;

  // Determine regime (priority order: HALT > BEAR > DEFENSIVE > CAUTIOUS > NORMAL)
  let regime: MarketRegime;
  let reason: string;

  if (vix >= vixHaltThreshold) {
    regime = MarketRegime.HALT;
    reason = `VIX ${vix.toFixed(1)} >= ${vixHaltThreshold} threshold — full stop`;
  } else if (drawdownPct >= bearDropPct) {
    regime = MarketRegime.BEAR;
    reason = `SPY down ${(drawdownPct * 100).toFixed(1)}% from 52-week high $${spy52WeekHigh.toFixed(2)} — bear market`;
  } else if (sma200 > 0 && spyPrice < sma200) {
    regime = MarketRegime.DEFENSIVE;
    reason = `SPY $${spyPrice.toFixed(2)} below 200-day MA $${sma200.toFixed(2)} — defensive mode`;
  } else if (spyPrice < sma50) {
    regime = MarketRegime.CAUTIOUS;
    reason = `SPY $${spyPrice.toFixed(2)} below 50-day MA $${sma50.toFixed(2)} — cautious mode`;
  } else {
    regime = MarketRegime.NORMAL;
    reason = `SPY $${spyPrice.toFixed(2)} above MAs, VIX ${vix.toFixed(1)} — normal`;
  }

  return {
    regime,
    spyPrice: Math.round(spyPrice * 100) / 100,
    sma50: Math.round(sma50 * 100) / 100,
    sma200: Math.round(sma200 * 100) / 100,
    vix,
    spy52WeekHigh: Math.round(spy52WeekHigh * 100) / 100,
    drawdownPct: Math.round(drawdownPct * 10000) / 10000,
    reason,
  };
}
