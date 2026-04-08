"use client";

import Link from "next/link";
import { WheelStageIndicator } from "./WheelStageIndicator";

interface TickerData {
  id: string;
  symbol: string;
  stage: string | null;
  totalPremium: number;
  costBasis: number | null;
  sharesHeld: number;
  openContract: {
    type: string;
    strikePrice: number;
    expiration: string;
    premium: number;
    status: string;
  } | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function TickerCard({ ticker }: { ticker: TickerData }) {
  return (
    <Link href={`/ticker/${ticker.symbol}`}>
      <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 hover:border-blue-500 transition-colors active:scale-[0.98]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-white">{ticker.symbol}</h3>
          <span className="text-green-400 text-sm font-medium">
            {fmt(ticker.totalPremium)}
          </span>
        </div>

        {/* Stage indicator */}
        <WheelStageIndicator currentStage={ticker.stage} />

        {/* Open contract */}
        {ticker.openContract && (
          <div className="mt-3 bg-zinc-900 rounded-lg p-3 text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>
                {ticker.openContract.type === "PUT" ? "📉 Put" : "📈 Call"} @{" "}
                ${ticker.openContract.strikePrice}
              </span>
              <span>
                Exp{" "}
                {new Date(ticker.openContract.expiration).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" }
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
    </Link>
  );
}
