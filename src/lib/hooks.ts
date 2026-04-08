"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function usePortfolio() {
  return useSWR("/api/portfolio", fetcher, { refreshInterval: 30000 });
}

export function useTickers() {
  return useSWR("/api/tickers", fetcher, { refreshInterval: 30000 });
}

export function useBotStatus() {
  return useSWR("/api/bot/status", fetcher, { refreshInterval: 15000 });
}

export function useTrades(page = 1) {
  return useSWR(`/api/trades?page=${page}&limit=20`, fetcher, {
    refreshInterval: 30000,
  });
}

export function useSummary() {
  return useSWR("/api/summary", fetcher, { refreshInterval: 60000 });
}

export function useTickerCycles(symbol: string) {
  return useSWR(symbol ? `/api/tickers/${symbol}/cycles` : null, fetcher, {
    refreshInterval: 30000,
  });
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
