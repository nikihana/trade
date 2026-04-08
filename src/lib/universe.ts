import { getConfig } from "./config";

/**
 * Curated ~100 S&P 500 / Nasdaq 100 tickers ideal for the wheel strategy.
 * Large-cap, liquid options, $50-$300 range (as of 2026).
 */
export const WHEEL_UNIVERSE: string[] = [
  "AAPL", "ABBV", "ABT", "ADBE", "ADI", "ADP", "ADSK", "AIG", "AMAT", "AMD",
  "AMGN", "AMZN", "ANET", "AXP", "BA", "BAC", "BKNG", "BLK", "BMY", "BRK.B",
  "C", "CAT", "CL", "CMCSA", "COP", "COST", "CRM", "CSCO", "CVX", "D",
  "DE", "DHR", "DIS", "DOW", "DUK", "EMR", "EOG", "EXC", "F", "FDX",
  "GD", "GE", "GILD", "GM", "GOOG", "GOOGL", "GS", "HD", "HON", "IBM",
  "ICE", "INTC", "ISRG", "JNJ", "JPM", "KO", "LIN", "LLY", "LMT", "LOW",
  "MA", "MCD", "MDLZ", "MDT", "MET", "META", "MMM", "MO", "MRK", "MS",
  "MSFT", "NEE", "NFLX", "NKE", "NOC", "NVDA", "ORCL", "PEP", "PFE", "PG",
  "PM", "PYPL", "QCOM", "RTX", "SBUX", "SCHW", "SLB", "SNPS", "SO", "SOFI",
  "SPY", "T", "TGT", "TMO", "TMUS", "TSLA", "TXN", "UNH", "UNP", "UPS",
  "USB", "V", "VZ", "WFC", "WMT", "XOM",
];

/**
 * Get the screening universe — uses approved_tickers config if set, otherwise WHEEL_UNIVERSE
 */
export async function getScreeningUniverse(): Promise<string[]> {
  const override = await getConfig("approved_tickers");
  if (override && override.trim().length > 0) {
    return override.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  }
  return WHEEL_UNIVERSE;
}
