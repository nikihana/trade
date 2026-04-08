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
  guardBlock: string | null;
  openContract: {
    type: string;
    strikePrice: number;
    expiration: string;
    premium: number;
    status: string;
    buybackCost?: number;
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
            {ticker.livePL !== null && (
              <span className={`text-sm font-bold ${ticker.livePL >= 0 ? "text-green-400" : "text-red-400"}`}>
                {ticker.livePL >= 0 ? "+" : ""}{fmt(ticker.livePL)}
              </span>
            )}
            <span className="text-zinc-500 text-xs">
              {fmt(ticker.totalPremium)} prem
            </span>
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

        {/* Stage indicator */}
        <WheelStageIndicator currentStage={ticker.stage} />

        {/* Open contract */}
        {ticker.openContract && (
          <div className="mt-3 bg-zinc-900 rounded-lg p-3 text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>
                {ticker.openContract.type === "PUT" ? "Put" : "Call"} @ $
                {ticker.openContract.strikePrice}
              </span>
              <span>
                Exp{" "}
                {new Date(ticker.openContract.expiration).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }
                )}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-green-400">
                Premium: {fmt(ticker.openContract.premium)}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full ${
                  ticker.openContract.status === "OPEN"
                    ? "bg-blue-900 text-blue-300"
                    : "bg-yellow-900 text-yellow-300"
                }`}
              >
                {ticker.openContract.status}
              </span>
            </div>
          </div>
        )}

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
