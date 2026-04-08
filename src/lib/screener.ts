import { sql, genId } from "./db";
import { getLatestQuote, getOptionsContracts, getOptionQuote, getHistoricalBars } from "./alpaca";
import { targetPutStrike, targetExpiration } from "./options";
import { detectRegime } from "./regime";
import { getScreeningUniverse } from "./universe";
import { fetchEarningsDate, daysUntilEarnings } from "./earnings";
import { getConfigNum } from "./config";
import { MarketRegime } from "./types";
import { format, differenceInDays } from "date-fns";

interface CandidateResult {
  symbol: string;
  price: number;
  suggestedStrike: number;
  premium: number;
  premiumYield: number;
  ivPercentile: number | null;
  daysToEarnings: number | null;
  openInterest: number;
}

export interface ScreenResult {
  success: boolean;
  weekOf: string;
  candidates: CandidateResult[];
  screened: number;
  passed: number;
  regime: string;
  logs: string[];
}

export interface MorningCheckResult {
  success: boolean;
  regime: string;
  alerts: string[];
  logs: string[];
}

// ── Weekly Screen ────────────────────────────────────────

export async function runWeeklyScreen(): Promise<ScreenResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(`[screen] ${msg}`); };

  const now = new Date();
  // weekOf = the Sunday of this week
  const dayOfWeek = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek);
  const weekOf = format(sunday, "yyyy-MM-dd");

  try {
    // Check regime — don't screen in bear mode
    const regime = await detectRegime();
    log(`Regime: ${regime.regime} — SPY $${regime.spyPrice} | 200MA $${regime.sma200}`);

    if (regime.sma200 > 0 && regime.spyPrice < regime.sma200) {
      log("SPY below 200-day MA — screening paused");
      return { success: true, weekOf, candidates: [], screened: 0, passed: 0, regime: regime.regime, logs };
    }

    const universe = await getScreeningUniverse();
    log(`Universe: ${universe.length} tickers`);

    // ── Phase 1: Price filter (parallel batches of 20) ──
    const priceFiltered: { symbol: string; price: number }[] = [];
    const batchSize = 20;

    for (let i = 0; i < universe.length; i += batchSize) {
      if (Date.now() - startTime > 50000) { log("Timeout approaching, stopping price filter"); break; }

      const batch = universe.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (sym) => {
          const q = await getLatestQuote(sym);
          return { symbol: sym, price: q.lastPrice };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.price >= 50 && r.value.price <= 300) {
          priceFiltered.push(r.value);
        }
      }
    }

    log(`Price filter: ${priceFiltered.length} of ${universe.length} passed ($50-$300)`);

    // ── Phase 2: Deep screen (batches of 5) ──
    const deepResults: CandidateResult[] = [];
    const { minDate, maxDate } = await targetExpiration();

    for (let i = 0; i < priceFiltered.length; i += 5) {
      if (Date.now() - startTime > 50000) { log("Timeout approaching, stopping deep screen"); break; }

      const batch = priceFiltered.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((t) => deepScreenTicker(t.symbol, t.price, minDate, maxDate))
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          deepResults.push(r.value);
        }
      }
    }

    log(`Deep screen: ${deepResults.length} passed all filters`);

    // ── Rank by premium yield, take top 5 ──
    deepResults.sort((a, b) => b.premiumYield - a.premiumYield);
    const top5 = deepResults.slice(0, 5);

    // ── Persist to DB ──
    await sql`DELETE FROM "Candidate" WHERE "weekOf" = ${weekOf}`;
    for (const c of top5) {
      await sql`INSERT INTO "Candidate" (id, "weekOf", symbol, price, "suggestedStrike", premium, "premiumYield", "ivPercentile", "daysToEarnings", "openInterest", regime)
        VALUES (${genId()}, ${weekOf}, ${c.symbol}, ${c.price}, ${c.suggestedStrike}, ${c.premium}, ${c.premiumYield}, ${c.ivPercentile}, ${c.daysToEarnings}, ${c.openInterest}, ${regime.regime})`;
    }

    // Log to TradeLog
    const summary = top5.map((c) => `${c.symbol} yield=${(c.premiumYield * 100).toFixed(1)}%`).join(", ");
    await sql`INSERT INTO "TradeLog" (id, timestamp, level, message, data) VALUES (${genId()}, now(), 'INFO', ${`WEEKLY SCREEN: ${top5.length} candidates — ${summary}`}, ${JSON.stringify({ weekOf, candidates: top5 })})`;

    log(`Saved ${top5.length} candidates for week of ${weekOf}`);
    for (const c of top5) {
      log(`  ${c.symbol}: $${c.price.toFixed(2)} | strike $${c.suggestedStrike} | prem $${c.premium.toFixed(2)} | yield ${(c.premiumYield * 100).toFixed(1)}% | OI ${c.openInterest}${c.daysToEarnings ? ` | ${c.daysToEarnings}d to earnings` : ""}`);
    }

    return {
      success: true,
      weekOf,
      candidates: top5,
      screened: priceFiltered.length,
      passed: deepResults.length,
      regime: regime.regime,
      logs,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR: ${msg}`);
    return { success: false, weekOf, candidates: [], screened: 0, passed: 0, regime: "UNKNOWN", logs };
  }
}

async function deepScreenTicker(
  symbol: string,
  price: number,
  minDate: string,
  maxDate: string
): Promise<CandidateResult | null> {
  try {
    const strike = await targetPutStrike(price, "30-delta");

    // Get put options near target strike
    const contracts = await getOptionsContracts(symbol, {
      type: "put",
      expiration_date_gte: minDate,
      expiration_date_lte: maxDate,
      strike_price_gte: String(strike - 5),
      strike_price_lte: String(strike + 5),
      limit: 10,
    });

    if (contracts.length === 0) return null;

    // Find best contract by proximity to target strike
    contracts.sort((a, b) => Math.abs(a.strikePrice - strike) - Math.abs(b.strikePrice - strike));
    const best = contracts[0];

    // Filter: open interest >= 1000
    if (best.openInterest < 1000) return null;

    // Get option quote
    const quote = await getOptionQuote(best.symbol);
    if (quote.midPrice <= 0) return null;
    const premium = quote.midPrice * 100;

    // Filter: earnings check (no earnings within 35 days)
    const earningsDate = await fetchEarningsDate(symbol);
    const dte = daysUntilEarnings(earningsDate);
    if (dte !== null && dte < 35) return null;

    // Calculate premium yield (annualized)
    const daysToExp = differenceInDays(new Date(best.expirationDate), new Date());
    const annualizedYield = daysToExp > 0
      ? (premium / (best.strikePrice * 100)) * (365 / daysToExp)
      : 0;

    // IV percentile approximation
    let ivPercentile: number | null = null;
    try {
      const bars = await getHistoricalBars(symbol, { limit: 30 });
      if (bars.length >= 10) {
        // Realized vol from daily returns
        const returns = [];
        for (let i = 1; i < bars.length; i++) {
          returns.push(Math.log(bars[i].close / bars[i - 1].close));
        }
        const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
        const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
        const realizedVol = Math.sqrt(variance) * Math.sqrt(252);

        // Approximate IV from option price (Brenner-Subrahmanyam)
        const T = daysToExp / 365;
        const impliedVol = T > 0
          ? (quote.midPrice * Math.sqrt(2 * Math.PI)) / (price * Math.sqrt(T))
          : 0;

        // IV percentile relative to realized vol range
        const minVol = realizedVol * 0.5;
        const maxVol = realizedVol * 2.0;
        if (maxVol > minVol) {
          ivPercentile = Math.min(100, Math.max(0,
            ((impliedVol - minVol) / (maxVol - minVol)) * 100
          ));
        }
      }
    } catch { /* skip IV calc on error */ }

    // Filter: IV percentile > 35% (if we could calculate it)
    if (ivPercentile !== null && ivPercentile < 35) return null;

    return {
      symbol,
      price: Math.round(price * 100) / 100,
      suggestedStrike: best.strikePrice,
      premium: Math.round(premium * 100) / 100,
      premiumYield: Math.round(annualizedYield * 10000) / 10000,
      ivPercentile: ivPercentile !== null ? Math.round(ivPercentile * 10) / 10 : null,
      daysToEarnings: dte,
      openInterest: best.openInterest,
    };
  } catch {
    return null;
  }
}

// ── Morning Check ────────────────────────────────────────

export async function runMorningCheck(): Promise<MorningCheckResult> {
  const logs: string[] = [];
  const alerts: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(`[morning] ${msg}`); };

  try {
    // 1. Regime check
    const regime = await detectRegime();
    log(`Regime: ${regime.regime} — SPY $${regime.spyPrice} | VIX ${regime.vix}`);

    if (regime.regime !== MarketRegime.NORMAL) {
      alerts.push(`Market regime: ${regime.regime} — ${regime.reason}`);
    }

    // 2. Check open positions for 50% profit
    const profitTarget = await getConfigNum("profit_target_pct", 50);
    const openContracts = await sql`
      SELECT c.*, t.symbol as ticker FROM "Contract" c
      JOIN "WheelCycle" wc ON wc.id = c."cycleId"
      JOIN "Ticker" t ON t.id = wc."tickerId"
      WHERE c.status IN ('OPEN', 'PENDING')
    `;

    for (const contract of openContracts) {
      try {
        const quote = await getOptionQuote(contract.symbol as string);
        if (quote.midPrice <= 0) continue;
        const currentCost = quote.midPrice * 100;
        const profitPct = ((Number(contract.premium) - currentCost) / Number(contract.premium)) * 100;

        if (profitPct >= profitTarget) {
          const msg = `${contract.ticker}: ${contract.type} @ $${contract.strikePrice} hit ${profitPct.toFixed(0)}% profit (target: ${profitTarget}%)`;
          alerts.push(msg);
          log(msg);
        } else {
          log(`${contract.ticker}: ${contract.type} @ $${contract.strikePrice} at ${profitPct.toFixed(0)}% profit`);
        }
      } catch { /* skip */ }
    }

    // 3. Check earnings proximity for held tickers
    const activeTickers = await sql`
      SELECT t.symbol FROM "Ticker" t
      JOIN "WheelCycle" wc ON wc."tickerId" = t.id AND wc."completedAt" IS NULL
      WHERE t.active = true
    `;

    for (const t of activeTickers) {
      try {
        const earningsDate = await fetchEarningsDate(t.symbol as string);
        const dte = daysUntilEarnings(earningsDate);
        if (dte !== null && dte <= 7) {
          const msg = `${t.symbol}: Earnings in ${dte} days!`;
          alerts.push(msg);
          log(msg);
        }
      } catch { /* skip */ }
    }

    // Log summary
    const level = alerts.length > 0 ? "WARN" : "INFO";
    const summary = alerts.length > 0
      ? `MORNING CHECK: ${alerts.length} alert(s) — ${alerts.join("; ")}`
      : `MORNING CHECK: All clear. ${openContracts.length} open positions, regime ${regime.regime}`;

    await sql`INSERT INTO "TradeLog" (id, timestamp, level, message, data) VALUES (${genId()}, now(), ${level}, ${summary}, ${JSON.stringify({ regime: regime.regime, alerts, openPositions: openContracts.length })})`;

    log(alerts.length > 0 ? `${alerts.length} alerts found` : "All clear");

    return { success: true, regime: regime.regime, alerts, logs };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR: ${msg}`);
    return { success: false, regime: "UNKNOWN", alerts: [], logs };
  }
}
