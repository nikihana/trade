"use client";

import { PortfolioCard } from "./components/PortfolioCard";
import { TickerCard } from "./components/TickerCard";
import { AddTickerDialog } from "./components/AddTickerDialog";
import { RunTickButton } from "./components/RunTickButton";
import { RegimeBadge } from "./components/RegimeBadge";
import { CapitalBar } from "./components/CapitalBar";
import { CandidatesCard } from "./components/CandidatesCard";
import { useTickers } from "@/lib/hooks";

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
  openContract: null | {
    type: string;
    strikePrice: number;
    expiration: string;
    premium: number;
    status: string;
    buybackCost?: number;
    closedReason?: string;
  };
}

export default function Home() {
  const { data: tickers, isLoading } = useTickers();

  const allTickers: TickerData[] = tickers || [];
  const active = allTickers.filter((t) => t.openContract);
  const pending = allTickers.filter((t) => !t.openContract);

  return (
    <div className="space-y-6">
      {/* Market regime */}
      <RegimeBadge />

      {/* Portfolio overview */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Portfolio
        </h2>
        <PortfolioCard />
      </section>

      {/* Capital deployment */}
      <CapitalBar />

      {/* Weekly picks */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Weekly Picks
        </h2>
        <CandidatesCard />
      </section>

      {/* Active wheels — only tickers with open contracts */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Active Wheels
          {active.length > 0 && (
            <span className="text-zinc-600 ml-2 font-normal">({active.length})</span>
          )}
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-zinc-800 rounded-xl p-4 animate-pulse h-32" />
            ))}
          </div>
        ) : active.length > 0 ? (
          <div className="space-y-3">
            {active.map((ticker) => (
              <TickerCard key={ticker.id} ticker={ticker} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No active positions. Add a ticker and run a tick to open a trade.
          </div>
        )}
      </section>

      {/* Pending — tickers added but no trade executed yet */}
      {!isLoading && pending.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Pending
            <span className="text-zinc-600 ml-2 font-normal">({pending.length})</span>
          </h2>
          <div className="space-y-3">
            {pending.map((ticker) => (
              <TickerCard key={ticker.id} ticker={ticker} />
            ))}
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            These tickers are queued but no trade has been executed yet. Run a tick or wait for the next cron.
          </p>
        </section>
      )}

      <div className="space-y-3">
        <AddTickerDialog />
        <RunTickButton />
      </div>
    </div>
  );
}
