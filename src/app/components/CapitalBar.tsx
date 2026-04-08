"use client";

import { useTickers, usePortfolio } from "@/lib/hooks";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function CapitalBar() {
  const { data: tickers } = useTickers();
  const { data: portfolio } = usePortfolio();

  if (!tickers || !portfolio?.account) return null;

  const totalEquity = portfolio.account.equity;
  const deployed = (tickers as { allocation: number }[]).reduce(
    (sum, t) => sum + (t.allocation || 0),
    0
  );
  const available = Math.max(totalEquity - deployed, 0);
  const pct = totalEquity > 0 ? (deployed / totalEquity) * 100 : 0;

  return (
    <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-400 uppercase tracking-wider font-medium">
          Capital Deployment
        </span>
        <span className="text-xs text-zinc-400">
          {pct.toFixed(0)}% deployed
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-zinc-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all ${
            pct > 70 ? "bg-yellow-500" : pct > 90 ? "bg-red-500" : "bg-green-500"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className="flex justify-between text-xs">
        <span className="text-green-400">{fmt(deployed)} deployed</span>
        <span className="text-zinc-400">{fmt(available)} available</span>
        <span className="text-white font-medium">{fmt(totalEquity)} total</span>
      </div>
    </div>
  );
}
