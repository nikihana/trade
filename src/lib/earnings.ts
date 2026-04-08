/**
 * Fetch next earnings date from Yahoo Finance for a given stock symbol.
 * Returns null if no upcoming earnings found or on error.
 */
export async function fetchEarningsDate(symbol: string): Promise<Date | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const earnings =
      data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate;

    if (!Array.isArray(earnings) || earnings.length === 0) return null;

    // earningsDate is an array of {raw: epoch, fmt: "YYYY-MM-DD"}
    const nextEarnings = earnings[0];
    const epoch = nextEarnings?.raw;

    if (typeof epoch === "number" && epoch > 0) {
      return new Date(epoch * 1000);
    }

    return null;
  } catch {
    return null; // fail-open: treat as no earnings data
  }
}

/**
 * Calculate days until earnings. Returns null if no earnings date available.
 */
export function daysUntilEarnings(earningsDate: Date | null): number | null {
  if (!earningsDate) return null;
  const diffMs = earningsDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
