import { getConfig } from "./config";

/**
 * Curated large-cap stocks + liquid optionable ETFs for the wheel strategy.
 * The live price band (config: screen_min_price / screen_max_price) decides
 * which of these are affordable enough to trade on any given run.
 * Note: only securities with listed options can be wheeled — no mutual funds.
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
  // ── Liquid optionable ETFs (deep chains, many affordable) ──
  // Index / broad market
  "QQQ", "IWM", "DIA", "VTI", "VOO",
  // Sector SPDRs
  "XLF", "XLE", "XLK", "XLV", "XLI", "XLP", "XLU", "XLY", "XLB", "XLRE", "XLC",
  // Industry / thematic
  "SMH", "XBI", "KRE", "ARKK", "XOP", "ITB", "GDX",
  // Commodity
  "GLD", "SLV", "USO",
  // Fixed income
  "TLT", "HYG", "LQD", "AGG",
  // International
  "EEM", "EFA", "FXI", "EWZ", "VWO",
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
