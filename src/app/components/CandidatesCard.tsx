"use client";

import { useCandidates } from "@/lib/hooks";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function CandidatesCard() {
  const { data, isLoading } = useCandidates();

  if (isLoading) {
    return <div className="bg-zinc-800 rounded-xl p-4 animate-pulse h-40" />;
  }

  if (!data || !data.candidates || data.candidates.length === 0) {
    return (
      <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 text-center text-zinc-500 text-sm py-6">
        No candidates yet. Run the weekly screen to find picks.
      </div>
    );
  }

  return (
    <div className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center justify-between">
        <span className="text-xs text-zinc-400 uppercase tracking-wider font-medium">
          Weekly Picks
        </span>
        <span className="text-[10px] text-zinc-500">
          Week of {data.weekOf}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-700/50">
              <th className="text-left px-4 py-1.5 font-medium">Symbol</th>
              <th className="text-right px-2 py-1.5 font-medium">Price</th>
              <th className="text-right px-2 py-1.5 font-medium">Strike</th>
              <th className="text-right px-2 py-1.5 font-medium">Premium</th>
              <th className="text-right px-2 py-1.5 font-medium">Yield</th>
              <th className="text-right px-2 py-1.5 font-medium">IV%</th>
              <th className="text-right px-4 py-1.5 font-medium">Earn.</th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.map(
              (c: {
                symbol: string;
                price: number;
                suggestedStrike: number;
                premium: number;
                premiumYield: number;
                ivPercentile: number | null;
                daysToEarnings: number | null;
                openInterest: number;
              }) => (
                <tr
                  key={c.symbol}
                  className="border-b border-zinc-700/30"
                >
                  <td className="px-4 py-2.5 font-bold text-white">
                    {c.symbol}
                  </td>
                  <td className="px-2 py-2.5 text-right text-zinc-300">
                    {fmt(c.price)}
                  </td>
                  <td className="px-2 py-2.5 text-right text-zinc-300">
                    ${c.suggestedStrike}
                  </td>
                  <td className="px-2 py-2.5 text-right text-green-400">
                    {fmt(c.premium)}
                  </td>
                  <td className="px-2 py-2.5 text-right text-green-400 font-bold">
                    {(c.premiumYield * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-2.5 text-right text-zinc-400">
                    {c.ivPercentile !== null
                      ? `${c.ivPercentile.toFixed(0)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.daysToEarnings !== null ? (
                      <span
                        className={
                          c.daysToEarnings < 14
                            ? "text-yellow-400"
                            : "text-zinc-400"
                        }
                      >
                        {c.daysToEarnings}d
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
