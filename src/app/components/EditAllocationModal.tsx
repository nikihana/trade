"use client";

import { useState } from "react";
import { refreshAll } from "@/lib/hooks";

export function EditAllocationModal({
  symbol,
  currentAllocation,
  onClose,
}: {
  symbol: string;
  currentAllocation: number;
  onClose: () => void;
}) {
  const [allocation, setAllocation] = useState(String(currentAllocation));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(allocation);
    if (!val || val <= 0) {
      setError("Allocation must be greater than 0");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/tickers/${symbol}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocation: val }),
      });
      if (!res.ok) throw new Error("Save failed");
      refreshAll();
      onClose();
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">
            Edit {symbol} Allocation
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="px-4 py-4 space-y-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              Allocation ($)
            </label>
            <input
              type="number"
              value={allocation}
              onChange={(e) => setAllocation(e.target.value)}
              min={100}
              step={100}
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2.5 text-white font-mono text-lg focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className={`w-full py-3 rounded-xl font-medium text-sm transition-all ${
              saving
                ? "bg-blue-800 text-blue-300 animate-pulse"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
