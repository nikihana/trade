import { addDays, format } from "date-fns";
import {
  getOptionsContracts,
  getLatestQuote,
  getOptionQuote,
  submitMultiLegOrder,
  submitOptionOrder,
} from "./alpaca";
import { targetPutStrike, targetCallStrike, targetExpiration } from "./options";
import { getConfigNum } from "./config";
import type { AlpacaOptionContract } from "./types";

interface SpreadResult {
  sellLeg: AlpacaOptionContract;
  buyLeg: AlpacaOptionContract;
  netPremium: number; // credit received (sell premium - buy premium), per contract
  sellPremium: number;
  buyPremium: number;
}

// ── Bull Put Spread (CAUTIOUS mode) ──────────────────────

export async function findBullPutSpread(
  symbol: string
): Promise<SpreadResult | null> {
  const quote = await getLatestQuote(symbol);
  const sellStrike = await targetPutStrike(quote.lastPrice);
  const spreadWidth = await getConfigNum("spread_width", 10);
  const buyStrike = sellStrike - spreadWidth;
  const { minDate, maxDate } = await targetExpiration();

  // Find sell leg (higher strike)
  const sellContracts = await getOptionsContracts(symbol, {
    type: "put",
    expiration_date_gte: minDate,
    expiration_date_lte: maxDate,
    strike_price_gte: String(sellStrike - 3),
    strike_price_lte: String(sellStrike + 3),
  });
  if (sellContracts.length === 0) return null;
  sellContracts.sort((a, b) => Math.abs(a.strikePrice - sellStrike) - Math.abs(b.strikePrice - sellStrike));
  const sellLeg = sellContracts[0];

  // Find buy leg (lower strike, protection)
  const buyContracts = await getOptionsContracts(symbol, {
    type: "put",
    expiration_date_gte: minDate,
    expiration_date_lte: maxDate,
    strike_price_gte: String(buyStrike - 3),
    strike_price_lte: String(buyStrike + 3),
  });
  if (buyContracts.length === 0) return null;
  buyContracts.sort((a, b) => Math.abs(a.strikePrice - buyStrike) - Math.abs(b.strikePrice - buyStrike));
  const buyLeg = buyContracts[0];

  // Get quotes
  const [sellQ, buyQ] = await Promise.all([
    getOptionQuote(sellLeg.symbol),
    getOptionQuote(buyLeg.symbol),
  ]);

  const sellPremium = sellQ.midPrice * 100;
  const buyPremium = buyQ.midPrice * 100;
  const netPremium = sellPremium - buyPremium;

  if (netPremium <= 0) return null; // no credit = no trade

  return { sellLeg, buyLeg, netPremium, sellPremium, buyPremium };
}

// ── Bear Call Spread (DEFENSIVE/BEAR mode) ───────────────

export async function findBearCallSpread(
  symbol: string,
  maxDte?: number
): Promise<SpreadResult | null> {
  const quote = await getLatestQuote(symbol);
  const sellStrike = Math.ceil(quote.lastPrice * 1.05); // 5% OTM
  const spreadWidth = await getConfigNum("spread_width", 10);
  const buyStrike = sellStrike + spreadWidth;

  let minDate: string, maxDate: string;

  if (maxDte) {
    const now = new Date();
    minDate = format(addDays(now, 7), "yyyy-MM-dd");
    maxDate = format(addDays(now, maxDte), "yyyy-MM-dd");
  } else {
    const exp = await targetExpiration();
    minDate = exp.minDate;
    maxDate = exp.maxDate;
  }

  // Find sell leg (lower strike)
  const sellContracts = await getOptionsContracts(symbol, {
    type: "call",
    expiration_date_gte: minDate,
    expiration_date_lte: maxDate,
    strike_price_gte: String(sellStrike - 3),
    strike_price_lte: String(sellStrike + 3),
  });
  if (sellContracts.length === 0) return null;
  sellContracts.sort((a, b) => Math.abs(a.strikePrice - sellStrike) - Math.abs(b.strikePrice - sellStrike));
  const sellLeg = sellContracts[0];

  // Find buy leg (higher strike, protection)
  const buyContracts = await getOptionsContracts(symbol, {
    type: "call",
    expiration_date_gte: minDate,
    expiration_date_lte: maxDate,
    strike_price_gte: String(buyStrike - 3),
    strike_price_lte: String(buyStrike + 3),
  });
  if (buyContracts.length === 0) return null;
  buyContracts.sort((a, b) => Math.abs(a.strikePrice - buyStrike) - Math.abs(b.strikePrice - buyStrike));
  const buyLeg = buyContracts[0];

  const [sellQ, buyQ] = await Promise.all([
    getOptionQuote(sellLeg.symbol),
    getOptionQuote(buyLeg.symbol),
  ]);

  const sellPremium = sellQ.midPrice * 100;
  const buyPremium = buyQ.midPrice * 100;
  const netPremium = sellPremium - buyPremium;

  if (netPremium <= 0) return null;

  return { sellLeg, buyLeg, netPremium, sellPremium, buyPremium };
}

// ── Iron Condor (DEFENSIVE mode) ─────────────────────────

export async function findIronCondor(
  symbol: string,
  maxDte?: number
): Promise<{ putSpread: SpreadResult; callSpread: SpreadResult } | null> {
  const [putSpread, callSpread] = await Promise.all([
    findBullPutSpread(symbol),
    findBearCallSpread(symbol, maxDte),
  ]);

  if (!putSpread || !callSpread) return null;

  return { putSpread, callSpread };
}

// ── Submit Spread Order ──────────────────────────────────

export async function submitSpreadOrder(
  sellSymbol: string,
  buySymbol: string,
  type: "put" | "call"
): Promise<Record<string, unknown>> {
  return submitMultiLegOrder({
    legs: [
      {
        symbol: sellSymbol,
        ratio_qty: 1,
        side: "sell",
        position_intent: "sell_to_open",
      },
      {
        symbol: buySymbol,
        ratio_qty: 1,
        side: "buy",
        position_intent: "buy_to_open",
      },
    ],
    type: "market",
    time_in_force: "day",
  });
}

// ── SPY Put Hedge (BEAR mode) ────────────────────────────

export async function buySpyPutHedge(
  accountEquity: number
): Promise<{ contract: AlpacaOptionContract; premium: number } | null> {
  const hedgePct = await getConfigNum("hedge_pct", 0.05);
  const budget = accountEquity * hedgePct;

  const quote = await getLatestQuote("SPY");
  const strike = Math.round(quote.lastPrice * 0.95); // 5% OTM

  // Target 30-60 days out for hedge
  const now = new Date();
  const minDate = format(addDays(now, 25), "yyyy-MM-dd");
  const maxDate = format(addDays(now, 65), "yyyy-MM-dd");

  const contracts = await getOptionsContracts("SPY", {
    type: "put",
    expiration_date_gte: minDate,
    expiration_date_lte: maxDate,
    strike_price_gte: String(strike - 5),
    strike_price_lte: String(strike + 5),
  });

  if (contracts.length === 0) return null;

  contracts.sort(
    (a, b) => Math.abs(a.strikePrice - strike) - Math.abs(b.strikePrice - strike)
  );

  const best = contracts[0];
  const q = await getOptionQuote(best.symbol);
  const premium = q.midPrice * 100;

  if (premium <= 0 || premium > budget) return null;

  // Buy the put
  await submitOptionOrder({
    symbol: best.symbol,
    qty: 1,
    side: "buy",
    type: "market",
    time_in_force: "day",
  });

  return { contract: best, premium };
}
