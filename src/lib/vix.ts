/**
 * Fetch current VIX level from Yahoo Finance
 */
export async function fetchVix(): Promise<number> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1d",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );

    if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);

    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;

    if (typeof price === "number" && price > 0) {
      return Math.round(price * 100) / 100;
    }

    throw new Error("No valid VIX price in response");
  } catch (error) {
    console.warn(
      `VIX fetch failed: ${error instanceof Error ? error.message : String(error)}. Defaulting to 20.`
    );
    return 20; // safe default — assumes normal conditions
  }
}
