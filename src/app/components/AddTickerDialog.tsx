"use client";

import { useState } from "react";
import { refreshAll } from "@/lib/hooks";

const strikeOptions = [
  { value: "30-delta", label: "30-delta (recommended)" },
  { value: "10pct-otm", label: "10% OTM" },
  { value: "5pct-otm", label: "5% OTM" },
  { value: "atm", label: "At the money" },
];

export function AddTickerDialog() {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [allocation, setAllocation] = useState("");
  const [strikePreference, setStrikePreference] = useState("30-delta");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim() || !allocation) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/tickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim(),
          allocation: parseFloat(allocation),
          strikePreference,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add ticker");
      }

      setSymbol("");
      setAllocation("");
      setStrikePreference("30-delta");
      setOpen(false);
      refreshAll();
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
        + Add Position
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Add Position</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(""); }}
          className="text-zinc-400 hover:text-white transition-colors text-lg"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Symbol */}
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Stock symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. NVDA"
            className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            autoFocus
            maxLength={10}
          />
        </div>

        {/* Allocation */}
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Allocation ($)</label>
          <input
            type="number"
            value={allocation}
            onChange={(e) => setAllocation(e.target.value)}
            placeholder="e.g. 20000"
            min={100}
            step={100}
            className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Strike Preference */}
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-zinc-400 block mb-1">Strike preference</label>
          <select
            value={strikePreference}
            onChange={(e) => setStrikePreference(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none"
          >
            {strikeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !symbol.trim() || !allocation}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-600 text-white py-2.5 rounded-lg font-medium transition-colors text-sm"
      >
        {loading ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
