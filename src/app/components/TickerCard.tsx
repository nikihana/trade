"use client";

import Link from "next/link";
import { useState } from "react";
import { WheelStageIndicator } from "./WheelStageIndicator";
import { CloseConfirmModal } from "./CloseConfirmModal";
import { EditAllocationModal } from "./EditAllocationModal";
import { refreshAll } from "@/lib/hooks";

interface TickerData {
  id: string;
  symbol: string;
  stage: string | null;
  totalPremium: number;
  costBasis: number | null;
  sharesHeld: number;
  allocation: number;
  strikePreference: string;
  livePL: number | null;
  stockPrice: number;
  guardBlock: string | null;
  openContract: {
    type: string;
    strikePrice: number;
    expiration: string;
    premium: number;
    status: string;
    buybackCost?: number;
    closedReason?: string;
  } | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtK(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return fmt(n);
}

const strikeLabels: Record<string, string> = {
  "30-delta": "30d",
  "10pct-otm": "10%",
  "5pct-otm": "5%",
  "atm": "ATM",
};

export function TickerCard({ ticker }: { ticker: TickerData }) {
  const [showClose, setShowClose] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  return (
    <>
      <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <Link href={`/ticker/${ticker.symbol}`} className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">{ticker.symbol}</h3>
            {ticker.allocation > 0 && (
              <span className="text-xs text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded">
                {fmtK(ticker.allocation)}
              </span>
            )}
            <span className="text-[10px] text-zinc-600">
              {strikeLabels[ticker.strikePreference] || ticker.strikePreference}
            </span>
            {ticker.guardBlock && (
              <span
                className="text-[10px] bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded cursor-help"
                title={ticker.guardBlock}
              >
                BLOCKED
              </span>
            )}
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.preventDefault(); setShowEdit(true); }}
              className="text-xs text-zinc-500 hover:text-blue-400 transition-colors px-1.5 py-0.5 rounded hover:bg-blue-900/20"
              title="Edit allocation"
            >
              Edit
            </button>
            {ticker.openContract ? (
              <button
                onClick={(e) => { e.preventDefault(); setShowClose(true); }}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-1.5 py-0.5 rounded hover:bg-red-900/20"
                title="Close position"
              >
                Close
              </button>
            ) : (
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  await fetch(`/api/tickers/${ticker.symbol}`, { method: "DELETE" });
                  refreshAll();
                }}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-1.5 py-0.5 rounded hover:bg-red-900/20"
                title="Remove"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Pending open banner */}
        {ticker.openContract?.status === "PENDING" && (
          <div className="bg-blue-900/30 border border-blue-800 rounded-lg px-3 py-2 mb-2 text-xs text-blue-300">
            Limit sell order open — waiting to fill
          </div>
        )}

        {/* Pending close banner */}
        {ticker.openContract?.status === "PENDING_CLOSE" && (
          <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg px-3 py-2 mb-2 text-xs text-yellow-300">
            Limit buy-to-close order open — waiting to fill
          </div>
        )}

        {/* Failed close warning */}
        {ticker.openContract?.closedReason === "FAILED_CLOSE" && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mb-2 text-xs text-red-300">
            Close failed — position still open on Alpaca. Try closing again during market hours.
          </div>
        )}

        {/* Stage indicator */}
        <WheelStageIndicator currentStage={ticker.stage} />

        {/* Open contract */}
        {ticker.openContract && (() => {
          const strike = Number(ticker.openContract.strikePrice);
          const price = ticker.stockPrice;
          const isPut = ticker.openContract.type === "PUT";
          const itm = isPut ? price < strike : price > strike;
          const pctFromStrike = strike > 0 ? Math.abs((strike - price) / strike * 100) : 0;
          const premium = ticker.openContract.premium;
          const buyback = ticker.openContract.buybackCost || 0;
          const closeNowPL = premium > 0 ? premium - buyback : 0;
          const isPending = ticker.openContract.status === "PENDING";
          const isClosing = ticker.openContract.status === "PENDING_CLOSE";

          return (
            <div className="mt-3 bg-zinc-900 rounded-lg p-3 text-xs space-y-2">
              {/* Status + ITM/OTM */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${itm ? "bg-red-500" : "bg-green-500"}`} />
                  <span className={`font-medium ${itm ? "text-red-400" : "text-green-400"}`}>
                    {isPut ? "Put" : "Call"} ${strike} · {itm ? "ITM" : "OTM"} {pctFromStrike.toFixed(1)}%
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    isClosing ? "bg-yellow-900 text-yellow-300"
                    : isPending ? "bg-blue-900 text-blue-300"
                    : "bg-green-900 text-green-300"
                  }`}
                >
                  {isClosing ? "CLOSING" : isPending ? "OPENING" : "OPEN"}
                </span>
              </div>

              {/* Stock price + expiry */}
              <div className="flex justify-between text-zinc-500">
                <span>Stock ${price.toFixed(2)}</span>
                <span>
                  Exp{" "}
                  {new Date(ticker.openContract.expiration).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }
                  )}
                </span>
              </div>

              {/* P&L breakdown — "if I close now" */}
              {!isPending && (
                <div className="border-t border-zinc-800 pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Collected</span>
                    <span className="text-green-400">+{fmt(premium)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">To close now</span>
                    <span className="text-red-300">-{fmt(buyback)}</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-800 pt-1">
                    <span className="text-white font-medium">Net if closed</span>
                    <span className={`font-bold ${closeNowPL >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {closeNowPL >= 0 ? "+" : ""}{fmt(closeNowPL)}
                    </span>
                  </div>
                </div>
              )}

              {/* Pending — no P&L yet */}
              {isPending && (
                <div className="border-t border-zinc-800 pt-2">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Est. premium</span>
                    <span className="text-zinc-500">{fmt(premium)}</span>
                  </div>
                  <p className="text-zinc-600 mt-1">No premium collected until order fills</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Shares held */}
        {ticker.sharesHeld > 0 && (
          <div className="mt-2 text-xs text-zinc-400">
            Holding {ticker.sharesHeld} shares
            {ticker.costBasis && ` @ ${fmt(ticker.costBasis)}`}
          </div>
        )}
      </div>

      {showClose && (
        <CloseConfirmModal
          symbol={ticker.symbol}
          onClose={() => setShowClose(false)}
        />
      )}
      {showEdit && (
        <EditAllocationModal
          symbol={ticker.symbol}
          currentAllocation={ticker.allocation}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}
