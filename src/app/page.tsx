"use client";

import { PortfolioCard } from "./components/PortfolioCard";
import { TickerCard } from "./components/TickerCard";
import { AddTickerDialog } from "./components/AddTickerDialog";
import { useTickers } from "@/lib/hooks";

export default function Home() {
  const { data: tickers, isLoading } = useTickers();

  return (
    <div className="space-y-6">
      {/* Portfolio overview */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Portfolio
        </h2>
        <PortfolioCard />
      </section>

      {/* Active wheels */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Active Wheels
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-zinc-800 rounded-xl p-4 animate-pulse h-32"
              />
            ))}
          </div>
        ) : tickers?.length > 0 ? (
          <div className="space-y-3">
            {tickers.map(
              (ticker: {
                id: string;
                symbol: string;
                stage: string | null;
                totalPremium: number;
                costBasis: number | null;
                sharesHeld: number;
                openContract: null | {
                  type: string;
                  strikePrice: number;
                  expiration: string;
                  premium: number;
                  status: string;
                };
              }) => (
                <TickerCard key={ticker.id} ticker={ticker} />
              )
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-zinc-500">
            <p className="text-4xl mb-3">🎡</p>
            <p className="text-lg font-medium text-zinc-400">
              No wheels spinning yet
            </p>
            <p className="text-sm mt-1">
              Add a ticker below to start the wheel strategy
            </p>
          </div>
        )}

        <div className="mt-4">
          <AddTickerDialog />
        </div>
      </section>
    </div>
  );
}
