"use client";

import { useState } from "react";
import { mutate } from "swr";

export function RunTickButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    logs: string[];
  } | null>(null);

  async function handleRun() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/bot/tick", { method: "POST" });
      const data = await res.json();
      setResult(data);

      // Refresh all dashboard data
      mutate("/api/tickers");
      mutate("/api/portfolio");
      mutate("/api/trades?page=1&limit=20");
      mutate("/api/summary");
    } catch (err) {
      setResult({
        success: false,
        logs: [err instanceof Error ? err.message : "Request failed"],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleRun}
        disabled={loading}
        className={`w-full py-3 rounded-xl font-medium transition-all ${
          loading
            ? "bg-yellow-700 text-yellow-200 animate-pulse"
            : "bg-green-600 hover:bg-green-500 active:bg-green-700 text-white"
        }`}
      >
        {loading ? "Running bot tick..." : "Run Bot Tick"}
      </button>

      {result && (
        <div
          className={`rounded-xl p-3 text-xs font-mono space-y-1 max-h-48 overflow-y-auto ${
            result.success
              ? "bg-green-900/30 border border-green-800 text-green-300"
              : "bg-red-900/30 border border-red-800 text-red-300"
          }`}
        >
          {result.logs.map((log, i) => (
            <p key={i}>{log}</p>
          ))}
        </div>
      )}
    </div>
  );
}
