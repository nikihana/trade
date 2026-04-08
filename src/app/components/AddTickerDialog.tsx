"use client";

import { useState } from "react";
import { mutate } from "swr";

export function AddTickerDialog() {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/tickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add ticker");
      }

      setSymbol("");
      setOpen(false);
      mutate("/api/tickers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors"
      >
        + Add Ticker
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-800 rounded-xl p-4 border border-zinc-700"
    >
      <label className="text-sm text-zinc-400 block mb-2">Stock Symbol</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="e.g. ORCL"
          className="flex-1 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          autoFocus
          maxLength={10}
        />
        <button
          type="submit"
          disabled={loading || !symbol.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {loading ? "..." : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSymbol("");
            setError("");
          }}
          className="text-zinc-400 px-3 py-2 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </form>
  );
}
