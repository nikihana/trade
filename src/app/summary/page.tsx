"use client";

import { useSummary } from "@/lib/hooks";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export default function SummaryPage() {
  const { data, isLoading, error } = useSummary();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-zinc-800 rounded-xl p-4 animate-pulse h-24"
          />
        ))}
      </div>
    );
  }

  if (error || !data || data.error) {
    return (
      <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
        {data?.error || "Failed to load summary"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Daily Summary</h1>

      {/* Account */}
      <section className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Account
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-zinc-400">Cash</p>
            <p className="text-lg font-bold">{fmt(data.account.cash)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Equity</p>
            <p className="text-lg font-bold">{fmt(data.account.equity)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Buying Power</p>
            <p className="text-sm font-medium">
              {fmt(data.account.buyingPower)}
            </p>
          </div>
        </div>
      </section>

      {/* Totals */}
      <section className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Totals
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-zinc-400">Open</p>
            <p className="text-lg font-bold">{data.totals.openContracts}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Premium</p>
            <p className="text-lg font-bold text-green-400">
              {fmt(data.totals.totalPremium)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">P&L</p>
            <p
              className={`text-lg font-bold ${data.totals.totalRealizedPL >= 0 ? "text-green-400" : "text-red-400"}`}
            >
              {fmt(data.totals.totalRealizedPL)}
            </p>
          </div>
        </div>
      </section>

      {/* Active Wheels */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Active Wheels
        </h2>
        {data.activeCycles.length === 0 ? (
          <p className="text-zinc-500 text-sm">No active wheels</p>
        ) : (
          <div className="space-y-2">
            {data.activeCycles.map(
              (c: {
                symbol: string;
                stage: string;
                totalPremium: number;
                costBasis: number | null;
                sharesHeld: number;
                openContract: {
                  type: string;
                  strikePrice: number;
                  expiration: string;
                } | null;
              }) => (
                <div
                  key={c.symbol}
                  className="bg-zinc-800 rounded-xl p-4 border border-zinc-700"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{c.symbol}</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-900 text-blue-300">
                      {c.stage}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-zinc-400">
                    <span>Premium: {fmt(c.totalPremium)}</span>
                    {c.sharesHeld > 0 && (
                      <span>{c.sharesHeld} shares held</span>
                    )}
                    {c.openContract && (
                      <span>
                        {c.openContract.type} @${c.openContract.strikePrice}
                      </span>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* Recent Trades */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Recent Trades
        </h2>
        {data.recentTrades.length === 0 ? (
          <p className="text-zinc-500 text-sm">No trades yet</p>
        ) : (
          <div className="space-y-2">
            {data.recentTrades.map(
              (t: {
                id: string;
                timestamp: string;
                ticker: string | null;
                message: string;
              }) => (
                <div
                  key={t.id}
                  className="bg-zinc-800 rounded-lg p-3 border border-zinc-700 text-sm"
                >
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span className="text-blue-400 font-medium">
                      {t.ticker}
                    </span>
                    <span>
                      {new Date(t.timestamp).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-zinc-300 break-words">{t.message}</p>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}
