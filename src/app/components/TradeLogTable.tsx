"use client";

import { useTrades } from "@/lib/hooks";
import { useState } from "react";

export function TradeLogTable() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTrades(page);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="bg-zinc-800 rounded-lg p-3 animate-pulse h-16"
          />
        ))}
      </div>
    );
  }

  if (!data?.trades?.length) {
    return (
      <div className="text-center text-zinc-500 py-8">
        No trades yet. Add a ticker to get started.
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2">
        {data.trades.map(
          (trade: {
            id: string;
            timestamp: string;
            level: string;
            ticker: string | null;
            message: string;
          }) => (
            <div
              key={trade.id}
              className="bg-zinc-800 rounded-lg p-3 border border-zinc-700"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      trade.level === "TRADE"
                        ? "bg-green-900 text-green-300"
                        : trade.level === "ERROR"
                          ? "bg-red-900 text-red-300"
                          : trade.level === "WARN"
                            ? "bg-yellow-900 text-yellow-300"
                            : "bg-zinc-700 text-zinc-300"
                    }`}
                  >
                    {trade.level}
                  </span>
                  {trade.ticker && (
                    <span className="text-xs text-blue-400 font-medium">
                      {trade.ticker}
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-500">
                  {new Date(trade.timestamp).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "America/Los_Angeles",
                  })}
                </span>
              </div>
              <p className="text-sm text-zinc-300 break-words">
                {trade.message}
              </p>
            </div>
          )
        )}
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 bg-zinc-800 rounded-lg text-sm disabled:opacity-30 hover:bg-zinc-700 text-zinc-300"
          >
            ← Prev
          </button>
          <span className="px-3 py-1.5 text-sm text-zinc-500">
            {page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            className="px-3 py-1.5 bg-zinc-800 rounded-lg text-sm disabled:opacity-30 hover:bg-zinc-700 text-zinc-300"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
