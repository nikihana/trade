"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Fetch config to get refresh interval
export function useConfig() {
  return useSWR("/api/config", fetcher, { refreshInterval: 60000 });
}

function useRefreshMs() {
  const { data } = useConfig();
  if (!data || !Array.isArray(data)) return 30000;
  const row = data.find((c: { key: string }) => c.key === "dashboard_refresh_min");
  if (!row) return 30000;
  return Math.max(parseFloat(row.value) * 60000, 5000); // min 5s
}

export function usePortfolio() {
  const ms = useRefreshMs();
  return useSWR("/api/portfolio", fetcher, { refreshInterval: ms });
}

export function useTickers() {
  const ms = useRefreshMs();
  return useSWR("/api/tickers", fetcher, { refreshInterval: ms });
}

export function useBotStatus() {
  return useSWR("/api/bot/status", fetcher, { refreshInterval: 15000 });
}

export function useTrades(page = 1) {
  const ms = useRefreshMs();
  return useSWR(`/api/trades?page=${page}&limit=20`, fetcher, {
    refreshInterval: ms,
  });
}

export function useSummary() {
  const ms = useRefreshMs();
  return useSWR("/api/summary", fetcher, { refreshInterval: ms * 2 });
}

export function useTickerCycles(symbol: string) {
  const ms = useRefreshMs();
  return useSWR(symbol ? `/api/tickers/${symbol}/cycles` : null, fetcher, {
    refreshInterval: ms,
  });
}

export function useTickerPositions(symbol: string) {
  const ms = useRefreshMs();
  return useSWR(
    symbol ? `/api/tickers/${symbol}/positions` : null,
    fetcher,
    { refreshInterval: ms }
  );
}

export function useOptionsChain(
  symbol: string,
  params?: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  return useSWR(
    symbol ? `/api/tickers/${symbol}/chain?${searchParams}` : null,
    fetcher
  );
}
