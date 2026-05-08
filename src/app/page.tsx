"use client";

import { PortfolioCard } from "./components/PortfolioCard";
import { TickerCard } from "./components/TickerCard";
import { AddTickerDialog } from "./components/AddTickerDialog";
import { RunTickButton } from "./components/RunTickButton";
import { RegimeBadge } from "./components/RegimeBadge";
import { CapitalBar } from "./components/CapitalBar";
import { PendingApprovalsCard } from "./components/PendingApprovalsCard";
import { useTickers, useCandidates } from "@/lib/hooks";

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
  flaggedForReview?: boolean;
  openContract: null | {
    type: string;
    strikePrice: number;
    expiration: string;
    premium: number;
    status: string;
    buybackCost?: number | null;
    closedReason?: string;
  };
}

export default function Home() {
  const { data: tickers, isLoading } = useTickers();
  const { data: candData } = useCandidates();
  const proposedCount: number = candData?.proposedCount ?? 0;

  const allTickers: TickerData[] = tickers || [];
  const active = allTickers.filter((t) => t.openContract);
  const pending = allTickers.filter((t) => !t.openContract);

  return (
    <div className="space-y-6">
      {/* Market regime + approval badge */}
      <div className="flex items-center gap-3">
        <div className="flex-1"><RegimeBadge /></div>
        {proposedCount > 0 && (
          <a href="#pending-approvals" className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-700/50 text-yellow-400 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-yellow-500/20 transition-colors shrink-0">
            <span className="bg-yellow-500 text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{proposedCount}</span>
            pending approval{proposedCount !== 1 ? "s" : ""}
          </a>
        )}
      </div>

      {/* Portfolio overview */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Portfolio
        </h2>
        <PortfolioCard />
      </section>

      {/* Capital deployment */}
      <CapitalBar />

      {/* Pending approvals */}
      {proposedCount > 0 && (
        <section id="pending-approvals">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Pending Approvals
            <span className="ml-2 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{proposedCount}</span>
          </h2>
          <PendingApprovalsCard />
        </section>
      )}

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
