"use client";

import useSWR, { mutate } from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Always fetch fresh data on page load, tab focus, and reconnect
const swrOptions = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  revalidateOnMount: true,
  dedupingInterval: 2000, // dedupe rapid duplicate requests within 2s
};

/**
 * Revalidate all dashboard data after a meaningful action.
 * Call this after: closing a position, adding a position, running a tick/screen/morning check.
 */
export function refreshAll() {
  mutate("/api/portfolio");
  mutate("/api/tickers");
  mutate("/api/candidates");
  mutate("/api/summary");
  mutate("/api/bot/status");
  mutate("/api/regime");
  // Trade logs use dynamic keys — revalidate all SWR keys matching trades
  mutate((key: string) => typeof key === "string" && key.startsWith("/api/trades"), undefined, { revalidate: true });
}

export function useConfig() {
  return useSWR("/api/config", fetcher, swrOptions);
}

export function usePortfolio() {
  return useSWR("/api/portfolio", fetcher, swrOptions);
}

export function useTickers() {
  return useSWR("/api/tickers", fetcher, swrOptions);
}

export function useBotStatus() {
  return useSWR("/api/bot/status", fetcher, swrOptions);
}

export function useTrades(page = 1) {
  return useSWR(`/api/trades?page=${page}&limit=20`, fetcher, swrOptions);
}

export function useSummary() {
  return useSWR("/api/summary", fetcher, swrOptions);
}

export function useTickerCycles(symbol: string) {
  return useSWR(symbol ? `/api/tickers/${symbol}/cycles` : null, fetcher, swrOptions);
}

export function useTickerPositions(symbol: string) {
  return useSWR(
    symbol ? `/api/tickers/${symbol}/positions` : null,
    fetcher,
    swrOptions
  );
}

export function useCandidates() {
  return useSWR("/api/candidates", fetcher, swrOptions);
}

export function useOptionsChain(
  symbol: string,
  params?: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  return useSWR(
    symbol ? `/api/tickers/${symbol}/chain?${searchParams}` : null,
    fetcher,
    swrOptions
  );
}
