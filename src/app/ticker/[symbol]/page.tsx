"use client";

import { use } from "react";
import Link from "next/link";
import { useTickerCycles, useTickerPositions } from "@/lib/hooks";
import { WheelStageIndicator } from "@/app/components/WheelStageIndicator";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function plColor(n: number) {
  return n >= 0 ? "text-green-400" : "text-red-400";
}

export default function TickerDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const upper = symbol.toUpperCase();
  const { data: cycles, isLoading: cyclesLoading } = useTickerCycles(upper);
  const { data: alpaca, isLoading: alpacaLoading } = useTickerPositions(upper);

  const isLoading = cyclesLoading || alpacaLoading;

  const activeCycle = cycles?.find(
    (c: { completedAt: string | null }) => !c.completedAt
  );
  const completedCycles =
    cycles?.filter((c: { completedAt: string | null }) => c.completedAt) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-zinc-400 hover:text-white transition-colors"
          >
            ←
          </Link>
          <h1 className="text-2xl font-bold">{upper}</h1>
        </div>
        <Link
          href={`/chain/${upper}`}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Options Chain →
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-zinc-800 rounded-xl p-4 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Account Snapshot ── */}
          {alpaca?.account && (
            <section className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
                Account
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-zinc-500">Cash</p>
                  <p className="text-sm font-bold">{fmt(alpaca.account.cash)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Buying Power</p>
                  <p className="text-sm font-bold">{fmt(alpaca.account.buyingPower)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Equity</p>
                  <p className="text-sm font-bold">{fmt(alpaca.account.equity)}</p>
                </div>
              </div>
            </section>
          )}

          {/* ── Active Wheel Stage ── */}
          {activeCycle && (
            <section className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
                Wheel Status
              </h2>
              <WheelStageIndicator currentStage={activeCycle.stage} />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <p className="text-xs text-zinc-500">Stage</p>
                  <p className="text-sm font-medium">
                    {activeCycle.stage.replace(/_/g, " ")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Premium Collected</p>
                  <p className="text-sm font-medium text-green-400">
                    {fmt(activeCycle.totalPremium)}
                  </p>
                </div>
                {activeCycle.costBasis && (
                  <div>
                    <p className="text-xs text-zinc-500">Cost Basis</p>
                    <p className="text-sm font-medium">{fmt(activeCycle.costBasis)}</p>
                  </div>
                )}
                {activeCycle.sharesHeld > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500">Shares Held</p>
                    <p className="text-sm font-medium">{activeCycle.sharesHeld}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Positions (from Alpaca) ── */}
          {alpaca?.positions?.length > 0 && (
            <section className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider px-4 pt-4 pb-2">
                Open Positions
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-500 border-b border-zinc-700">
                      <th className="text-left px-4 py-2 font-medium">Asset</th>
                      <th className="text-right px-4 py-2 font-medium">Price</th>
                      <th className="text-right px-4 py-2 font-medium">Qty</th>
                      <th className="text-right px-4 py-2 font-medium">Mkt Value</th>
                      <th className="text-right px-4 py-2 font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alpaca.positions.map(
                      (p: {
                        symbol: string;
                        currentPrice: number;
                        qty: number;
                        marketValue: number;
                        unrealizedPL: number;
                      }) => (
                        <tr
                          key={p.symbol}
                          className="border-b border-zinc-700/50"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-blue-400">
                            {p.symbol}
                          </td>
                          <td className="px-4 py-3 text-right">{fmt(p.currentPrice)}</td>
                          <td className="px-4 py-3 text-right">{p.qty}</td>
                          <td className="px-4 py-3 text-right">{fmt(p.marketValue)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${plColor(p.unrealizedPL)}`}>
                            {fmt(p.unrealizedPL)}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Contracts (from DB) ── */}
          {activeCycle?.contracts?.length > 0 && (
            <section className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
                Contracts
              </h2>
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
                    <div key={c.id} className="bg-zinc-900 rounded-lg p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">
                          {c.type === "PUT" ? "📉" : "📈"} {c.type} @ ${c.strikePrice}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            c.status === "OPEN"
                              ? "bg-blue-900 text-blue-300"
                              : c.status === "CLOSED"
                                ? "bg-green-900 text-green-300"
                                : c.status === "ASSIGNED"
                                  ? "bg-purple-900 text-purple-300"
                                  : "bg-zinc-700 text-zinc-300"
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
                            timeZone: "America/Los_Angeles",
                          })}
                        </span>
                        <span className="text-green-400">Premium: {fmt(c.premium)}</span>
                      </div>
                      {c.closedReason && (
                        <p className="text-xs text-zinc-500 mt-1">Closed: {c.closedReason}</p>
                      )}
                    </div>
                  )
                )}
              </div>
            </section>
          )}

          {/* ── Recent Orders (from Alpaca) ── */}
          {alpaca?.orders?.length > 0 && (
            <section className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider px-4 pt-4 pb-2">
                Recent Orders
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-500 border-b border-zinc-700">
                      <th className="text-left px-4 py-2 font-medium">Asset</th>
                      <th className="text-left px-4 py-2 font-medium">Type</th>
                      <th className="text-left px-4 py-2 font-medium">Side</th>
                      <th className="text-right px-4 py-2 font-medium">Qty</th>
                      <th className="text-right px-4 py-2 font-medium">Filled</th>
                      <th className="text-right px-4 py-2 font-medium">Avg Price</th>
                      <th className="text-right px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alpaca.orders.map(
                      (o: {
                        id: string;
                        symbol: string;
                        type: string;
                        side: string;
                        qty: string;
                        filledQty: string;
                        filledAvgPrice: string | null;
                        status: string;
                      }) => (
                        <tr key={String(o.id)} className="border-b border-zinc-700/50">
                          <td className="px-4 py-3 font-mono text-xs text-blue-400 max-w-[140px] truncate">
                            {String(o.symbol)}
                          </td>
                          <td className="px-4 py-3 text-xs capitalize">{String(o.type)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                String(o.side) === "sell"
                                  ? "bg-red-900/50 text-red-300"
                                  : "bg-green-900/50 text-green-300"
                              }`}
                            >
                              {String(o.side).toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">{o.qty}</td>
                          <td className="px-4 py-3 text-right">{o.filledQty}</td>
                          <td className="px-4 py-3 text-right">
                            {o.filledAvgPrice ? fmt(parseFloat(String(o.filledAvgPrice))) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                String(o.status) === "filled"
                                  ? "bg-green-900/50 text-green-300"
                                  : String(o.status) === "canceled" || String(o.status) === "expired"
                                    ? "bg-zinc-700 text-zinc-400"
                                    : "bg-yellow-900/50 text-yellow-300"
                              }`}
                            >
                              {String(o.status)}
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Completed Cycles ── */}
          {completedCycles.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
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
                    <div key={c.id} className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
                      <div className="flex justify-between">
                        <span className="text-sm text-zinc-400">
                          {new Date(c.startedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })} →{" "}
                          {new Date(c.completedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}
                        </span>
                        <span className={`text-sm font-medium ${plColor(c.realizedPL)}`}>
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
        </>
      )}
    </div>
  );
}
