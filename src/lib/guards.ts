import { getHistoricalBars, getLatestQuote } from "./alpaca";
import { getConfig, getConfigNum } from "./config";

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  data?: Record<string, unknown>;
}

const OK: GuardResult = { allowed: true };

// ── Rule 1a: Approved Tickers (market cap proxy) ─────────

export async function checkTickerApproved(symbol: string): Promise<GuardResult> {
  const list = await getConfig("approved_tickers");
  if (!list) return OK; // no whitelist = allow all

  const approved = list.split(",").map((s) => s.trim().toUpperCase());
  if (approved.includes(symbol.toUpperCase())) return OK;

  return {
    allowed: false,
    reason: `${symbol} not in approved tickers list`,
    data: { symbol, approved },
  };
}

// ── Rule 1b: Average Volume Check ────────────────────────

export async function checkAvgVolume(symbol: string): Promise<GuardResult> {
  const minVolume = await getConfigNum("min_avg_volume", 5000000);

  try {
    const bars = await getHistoricalBars(symbol, { limit: 20 });
    if (bars.length === 0) {
      return { allowed: false, reason: `${symbol}: no historical data available` };
    }

    const avgVolume = bars.reduce((sum, b) => sum + b.volume, 0) / bars.length;

    if (avgVolume < minVolume) {
      return {
        allowed: false,
        reason: `${symbol} avg volume ${Math.round(avgVolume).toLocaleString()} < ${minVolume.toLocaleString()} minimum`,
        data: { symbol, avgVolume, minVolume },
      };
    }

    return OK;
  } catch {
    // If we can't fetch bars, allow (don't block on API failure)
    return OK;
  }
}

// ── Rule 2: Premium Richness (IV Proxy) ──────────────────

export async function checkPremiumRichness(
  premium: number,
  strikePrice: number
): Promise<GuardResult> {
  const minPct = await getConfigNum("min_premium_pct", 0.005);
  const pct = premium / (strikePrice * 100);

  if (pct < minPct) {
    return {
      allowed: false,
      reason: `Premium too thin: ${(pct * 100).toFixed(2)}% < ${(minPct * 100).toFixed(2)}% min (IV likely low)`,
      data: { premium, strikePrice, pct, minPct },
    };
  }

  return OK;
}

// ── Rule 3: Stop-Loss ────────────────────────────────────

export async function checkStopLoss(
  currentPrice: number,
  strikePrice: number
): Promise<GuardResult> {
  const stopPct = await getConfigNum("stop_loss_pct", 0.15);
  const threshold = strikePrice * (1 - stopPct);

  if (currentPrice < threshold) {
    return {
      allowed: false, // meaning: stop-loss triggered, must close
      reason: `STOP-LOSS: price $${currentPrice.toFixed(2)} is ${((1 - currentPrice / strikePrice) * 100).toFixed(1)}% below $${strikePrice} strike (limit: ${(stopPct * 100).toFixed(0)}%)`,
      data: { currentPrice, strikePrice, threshold, dropPct: 1 - currentPrice / strikePrice },
    };
  }

  return OK;
}

// ── Rule 5: Minimum Call Premium ─────────────────────────

export async function checkCallPremium(premium: number): Promise<GuardResult> {
  const minPremium = await getConfigNum("min_call_premium", 20);

  if (premium < minPremium) {
    return {
      allowed: false,
      reason: `Call premium $${premium.toFixed(2)} below $${minPremium} minimum — premiums too thin, holding`,
      data: { premium, minPremium },
    };
  }

  return OK;
}

// ── Rule 7: Risk Cap ─────────────────────────────────────

export async function checkRiskCap(
  strikePrice: number,
  equity: number,
  cashAfterTrade: number
): Promise<GuardResult> {
  const maxPosPct = await getConfigNum("max_position_pct", 0.20);
  const minCashPct = await getConfigNum("min_cash_pct", 0.30);

  const positionSize = strikePrice * 100;
  const maxPosition = equity * maxPosPct;
  const minCash = equity * minCashPct;

  if (positionSize > maxPosition) {
    return {
      allowed: false,
      reason: `Position $${positionSize.toLocaleString()} exceeds ${(maxPosPct * 100).toFixed(0)}% cap ($${maxPosition.toLocaleString()})`,
      data: { positionSize, maxPosition, equity, maxPosPct },
    };
  }

  if (cashAfterTrade < minCash) {
    return {
      allowed: false,
      reason: `Cash after trade $${cashAfterTrade.toLocaleString()} below ${(minCashPct * 100).toFixed(0)}% floor ($${minCash.toLocaleString()})`,
      data: { cashAfterTrade, minCash, equity, minCashPct },
    };
  }

  return OK;
}

// ── Rule 8: Market Condition (SPY 50-day MA) ─────────────

export async function checkMarketCondition(): Promise<GuardResult> {
  const enabled = await getConfigNum("market_check_enabled", 1);
  if (!enabled) return OK;

  try {
    const bars = await getHistoricalBars("SPY", { limit: 60 });
    if (bars.length < 50) {
      return OK; // not enough data, allow trading
    }

    const last50 = bars.slice(-50);
    const sma50 = last50.reduce((sum, b) => sum + b.close, 0) / 50;
    const spyPrice = bars[bars.length - 1].close;

    if (spyPrice < sma50) {
      return {
        allowed: false,
        reason: `SPY $${spyPrice.toFixed(2)} below 50-day MA $${sma50.toFixed(2)} — pausing new put sales`,
        data: { spyPrice, sma50, diff: spyPrice - sma50 },
      };
    }

    return { allowed: true, data: { spyPrice, sma50 } };
  } catch {
    return OK; // don't block on API failure
  }
}
