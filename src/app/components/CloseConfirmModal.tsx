"use client";

import { useState, useEffect } from "react";
import { refreshAll } from "@/lib/hooks";

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
        setResult(data.pendingClose
          ? "Close order queued — fills at market open 9:30 AM ET"
          : "Positions closed successfully");
        refreshAll();
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

  const totalPremium = contracts.reduce((s, c) => s + c.premium, 0);
  const totalCost = contracts.reduce((s, c) => s + c.estimatedCost, 0);
  const netPL = totalPremium - totalCost;

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
                {contracts.map((c) => {
                  const cNetPL = c.premium - c.estimatedCost;
                  return (
                    <div
                      key={c.symbol}
                      className="bg-zinc-800 rounded-lg p-3 text-sm"
                    >
                      <div className="flex justify-between">
                        <span className="font-medium text-white">
                          {c.type === "PUT" ? "Put" : "Call"} @ ${c.strikePrice}
                        </span>
                        <span className={`font-bold ${cNetPL >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {cNetPL >= 0 ? "+" : ""}{fmt(cNetPL)}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1.5 text-xs text-zinc-400">
                        <span>Premium: <span className="text-green-400">{fmt(c.premium)}</span></span>
                        <span>Buyback: <span className="text-red-300">{fmt(c.estimatedCost)}</span></span>
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
                  );
                })}
              </div>

              {/* P&L Summary */}
              <div className="bg-zinc-800 rounded-lg p-3 mb-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Premium collected</span>
                  <span className="text-green-400 font-medium">{fmt(totalPremium)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Buyback cost</span>
                  <span className="text-red-300 font-medium">{fmt(totalCost)}</span>
                </div>
                <div className="border-t border-zinc-700 pt-1.5 flex justify-between text-sm">
                  <span className="text-white font-bold">
                    {netPL >= 0 ? "Net gain" : "Net loss"}
                  </span>
                  <span className={`font-bold text-lg ${netPL >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {netPL >= 0 ? "+" : ""}{fmt(netPL)}
                  </span>
                </div>
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
                  : `Confirm Close — ${netPL >= 0 ? "+" : ""}${fmt(netPL)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
