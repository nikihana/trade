"use client";

import { use } from "react";
import Link from "next/link";
import { useTickerCycles } from "@/lib/hooks";
import { WheelStageIndicator } from "@/app/components/WheelStageIndicator";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export default function TickerDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const { data: cycles, isLoading } = useTickerCycles(symbol);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-zinc-800 rounded-xl p-4 animate-pulse h-40" />
        <div className="bg-zinc-800 rounded-xl p-4 animate-pulse h-60" />
      </div>
    );
  }

  const activeCycle = cycles?.find(
    (c: { completedAt: string | null }) => !c.completedAt
  );
  const completedCycles =
    cycles?.filter((c: { completedAt: string | null }) => c.completedAt) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="text-zinc-400 hover:text-white transition-colors"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">{symbol.toUpperCase()}</h1>
      </div>

      {/* Active Cycle */}
      {activeCycle && (
        <section className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Current Cycle
          </h2>
          <WheelStageIndicator currentStage={activeCycle.stage} />

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <p className="text-xs text-zinc-400">Stage</p>
              <p className="text-sm font-medium">{activeCycle.stage}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Premium Collected</p>
              <p className="text-sm font-medium text-green-400">
                {fmt(activeCycle.totalPremium)}
              </p>
            </div>
            {activeCycle.costBasis && (
              <div>
                <p className="text-xs text-zinc-400">Cost Basis</p>
                <p className="text-sm font-medium">
                  {fmt(activeCycle.costBasis)}
                </p>
              </div>
            )}
            {activeCycle.sharesHeld > 0 && (
              <div>
                <p className="text-xs text-zinc-400">Shares Held</p>
                <p className="text-sm font-medium">{activeCycle.sharesHeld}</p>
              </div>
            )}
          </div>

          {/* Contracts in this cycle */}
          {activeCycle.contracts?.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs text-zinc-400 uppercase tracking-wider mb-2">
                Contracts
              </h3>
              <div className="space-y-2">
                {activeCycle.contracts.map(
                  (c: {
                    id: string;
                    type: string;
                    strikePrice: number;
                    expiration: string;
                    premium: number;
                    status: string;
                    closedReason: string | null;
                  }) => (
                    <div
                      key={c.id}
                      className="bg-zinc-900 rounded-lg p-3 text-sm"
                    >
                      <div className="flex justify-between">
                        <span className="font-medium">
                          {c.type === "PUT" ? "📉" : "📈"} {c.type} @{" "}
                          ${c.strikePrice}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            c.status === "OPEN"
                              ? "bg-blue-900 text-blue-300"
                              : c.status === "CLOSED"
                                ? "bg-green-900 text-green-300"
                                : c.status === "ASSIGNED"
                                  ? "bg-purple-900 text-purple-300"
                                  : c.status === "EXPIRED"
                                    ? "bg-zinc-700 text-zinc-300"
                                    : "bg-yellow-900 text-yellow-300"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-zinc-400">
                        <span>
                          Exp{" "}
                          {new Date(c.expiration).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="text-green-400">
                          Premium: {fmt(c.premium)}
                        </span>
                      </div>
                      {c.closedReason && (
                        <p className="text-xs text-zinc-500 mt-1">
                          Closed: {c.closedReason}
                        </p>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Completed Cycles */}
      {completedCycles.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Completed Cycles ({completedCycles.length})
          </h2>
          <div className="space-y-2">
            {completedCycles.map(
              (c: {
                id: string;
                startedAt: string;
                completedAt: string;
                totalPremium: number;
                realizedPL: number;
                contracts: { id: string }[];
              }) => (
                <div
                  key={c.id}
                  className="bg-zinc-800 rounded-xl p-4 border border-zinc-700"
                >
                  <div className="flex justify-between">
                    <span className="text-sm text-zinc-400">
                      {new Date(c.startedAt).toLocaleDateString()} →{" "}
                      {new Date(c.completedAt).toLocaleDateString()}
                    </span>
                    <span
                      className={`text-sm font-medium ${c.realizedPL >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {fmt(c.realizedPL)}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-zinc-400">
                    <span>Premium: {fmt(c.totalPremium)}</span>
                    <span>Contracts: {c.contracts?.length || 0}</span>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* Options chain link */}
      <Link
        href={`/chain/${symbol}`}
        className="block text-center bg-zinc-800 hover:bg-zinc-700 rounded-xl p-4 text-zinc-300 font-medium transition-colors"
      >
        View Options Chain →
      </Link>
    </div>
  );
}
