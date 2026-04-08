"use client";

import { useState, useEffect } from "react";
import { mutate } from "swr";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

interface CloseContract {
  type: string;
  symbol: string;
  strikePrice: number;
  premium: number;
  estimatedCost: number;
  spreadType: string | null;
}

export function CloseConfirmModal({
  symbol,
  onClose,
}: {
  symbol: string;
  onClose: () => void;
}) {
  const [contracts, setContracts] = useState<CloseContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tickers/${symbol}/close`)
      .then((r) => r.json())
      .then((data) => {
        setContracts(data.contracts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol]);

  async function handleConfirm() {
    setClosing(true);
    try {
      const res = await fetch(`/api/tickers/${symbol}/close`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setResult("Positions closed successfully");
        mutate("/api/tickers");
        mutate("/api/portfolio");
        mutate("/api/trades?page=1&limit=20&level=TRADE");
        setTimeout(onClose, 1500);
      } else {
        setResult(data.error || "Failed to close");
      }
    } catch {
      setResult("Request failed");
    } finally {
      setClosing(false);
    }
  }

  const totalCost = contracts.reduce((s, c) => s + c.estimatedCost, 0);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">
            Close {symbol} Positions
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-lg"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3">
          {loading ? (
            <div className="text-sm text-zinc-400 animate-pulse py-4">
              Loading positions...
            </div>
          ) : contracts.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4">
              No open contracts to close.
            </p>
          ) : (
            <>
              <p className="text-xs text-zinc-400 mb-3">
                The following will be bought-to-close on Alpaca:
              </p>
              <div className="space-y-2 mb-4">
                {contracts.map((c) => (
                  <div
                    key={c.symbol}
                    className="bg-zinc-800 rounded-lg p-3 text-sm"
                  >
                    <div className="flex justify-between">
                      <span className="font-medium text-white">
                        {c.type === "PUT" ? "Put" : "Call"} @ ${c.strikePrice}
                      </span>
                      <span className="text-red-400">
                        Cost: ~{fmt(c.estimatedCost)}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1 font-mono truncate">
                      {c.symbol}
                    </div>
                    {c.spreadType && (
                      <span className="text-[10px] text-purple-400">
                        {c.spreadType}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-between text-sm mb-4 px-1">
                <span className="text-zinc-400">Estimated total cost:</span>
                <span className="text-red-400 font-bold">{fmt(totalCost)}</span>
              </div>

              {result && (
                <div
                  className={`rounded-lg p-2 text-xs mb-3 ${
                    result.includes("success")
                      ? "bg-green-900/30 text-green-300"
                      : "bg-red-900/30 text-red-300"
                  }`}
                >
                  {result}
                </div>
              )}

              <button
                onClick={handleConfirm}
                disabled={closing}
                className={`w-full py-3 rounded-xl font-medium transition-all text-sm ${
                  closing
                    ? "bg-red-800 text-red-300 animate-pulse"
                    : "bg-red-600 hover:bg-red-500 active:bg-red-700 text-white"
                }`}
              >
                {closing
                  ? "Closing..."
                  : `Confirm Close — ${fmt(totalCost)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
