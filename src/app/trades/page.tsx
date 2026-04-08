"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

// ── Positions Tab (TICK snapshots) ──

function PositionsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR(
    `/api/trades?page=${page}&limit=20&level=TICK`,
    fetcher,
    { refreshInterval: 30000 }
  );

  if (isLoading) return <Loading />;
  if (!data?.trades?.length) return <Empty msg="No tick snapshots yet. Run a bot tick to generate one." />;

  // Group ticks — each TICK entry has JSON data with position details
  return (
    <div className="space-y-4">
      {data.trades.map((tick: { id: string; timestamp: string; message: string; data: string | null }) => {
        const parsed = tick.data ? JSON.parse(tick.data) : null;
        const positions = parsed?.positions || [];

        return (
          <div key={tick.id} className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
            {/* Header row */}
            <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-zinc-500">{fmtTime(tick.timestamp)}</span>
                {parsed && (
                  <>
                    <span className="text-white font-medium">Cash {fmt(parsed.cash)}</span>
                    <span className="text-zinc-400">Equity {fmt(parsed.equity)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Positions table */}
            {positions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-700/50">
                      <th className="text-left px-4 py-1.5 font-medium">Symbol</th>
                      <th className="text-right px-3 py-1.5 font-medium">Price</th>
                      <th className="text-left px-3 py-1.5 font-medium">Stage</th>
                      <th className="text-right px-3 py-1.5 font-medium">Opt Mid</th>
                      <th className="text-right px-3 py-1.5 font-medium">Premium</th>
                      <th className="text-right px-4 py-1.5 font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions
                      .sort((a: { symbol: string }, b: { symbol: string }) => a.symbol.localeCompare(b.symbol))
                      .map((p: { symbol: string; price: number; stage: string; optionMid: number; premium: number; unrealizedPL: number }) => (
                        <tr key={p.symbol} className="border-b border-zinc-700/30">
                          <td className="px-4 py-2 font-bold text-white">{p.symbol}</td>
                          <td className="px-3 py-2 text-right text-zinc-300">{fmt(p.price)}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              p.stage === "SELLING_PUTS" ? "bg-blue-900/60 text-blue-300"
                              : p.stage === "SELLING_CALLS" ? "bg-purple-900/60 text-purple-300"
                              : "bg-yellow-900/60 text-yellow-300"
                            }`}>
                              {p.stage.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-zinc-400">${p.optionMid.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-green-400">{fmt(p.premium)}</td>
                          <td className={`px-4 py-2 text-right font-medium ${p.unrealizedPL >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {fmt(p.unrealizedPL)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-2 text-xs text-zinc-500">{tick.message}</p>
            )}
          </div>
        );
      })}

      <Pagination page={page} totalPages={data.totalPages} onPage={setPage} />
    </div>
  );
}

// ── Activity Tab (TRADE entries) ──

function ActivityTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR(
    `/api/trades?page=${page}&limit=20&level=TRADE`,
    fetcher,
    { refreshInterval: 30000 }
  );

  if (isLoading) return <Loading />;
  if (!data?.trades?.length) return <Empty msg="No trades yet." />;

  return (
    <div>
      <div className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-3 py-2 font-medium">Symbol</th>
                <th className="text-left px-3 py-2 font-medium">Action</th>
                <th className="text-left px-3 py-2 font-medium">Details</th>
                <th className="text-right px-4 py-2 font-medium">Premium</th>
              </tr>
            </thead>
            <tbody>
              {data.trades.map((trade: { id: string; timestamp: string; ticker: string | null; message: string }) => {
                const { action, details, premium } = parseTradeMessage(trade.message);
                return (
                  <tr key={trade.id} className="border-b border-zinc-700/30">
                    <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">{fmtTime(trade.timestamp)}</td>
                    <td className="px-3 py-2.5 font-bold text-white">{trade.ticker || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        action.includes("SOLD") ? "bg-green-900/60 text-green-300"
                        : action.includes("CLOSED") ? "bg-blue-900/60 text-blue-300"
                        : action.includes("ASSIGNMENT") ? "bg-purple-900/60 text-purple-300"
                        : action.includes("CYCLE") ? "bg-yellow-900/60 text-yellow-300"
                        : "bg-zinc-700 text-zinc-300"
                      }`}>
                        {action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-300 max-w-[200px] truncate">{details}</td>
                    <td className="px-4 py-2.5 text-right text-green-400 font-medium">{premium || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={data.totalPages} onPage={setPage} />
    </div>
  );
}

function parseTradeMessage(msg: string): { action: string; details: string; premium: string } {
  // "SOLD PUT: ORCL260424P00130000 | Strike: $130 | Premium: $149.50 | Exp: 2026-04-24"
  // "CLOSED at 50% profit: ..."
  // "ASSIGNMENT: Now holding 100 shares @ $130"
  // "CYCLE COMPLETE: P&L $150.00"

  if (msg.startsWith("SOLD PUT")) {
    const parts = msg.split("|").map((s) => s.trim());
    const strike = parts.find((p) => p.startsWith("Strike"))?.replace("Strike: ", "") || "";
    const premium = parts.find((p) => p.startsWith("Premium"))?.replace("Premium: ", "") || "";
    const exp = parts.find((p) => p.startsWith("Exp"))?.replace("Exp: ", "") || "";
    return { action: "SOLD PUT", details: `${strike} strike, exp ${exp}`, premium };
  }
  if (msg.startsWith("SOLD CALL")) {
    const parts = msg.split("|").map((s) => s.trim());
    const strike = parts.find((p) => p.startsWith("Strike"))?.replace("Strike: ", "") || "";
    const premium = parts.find((p) => p.startsWith("Premium"))?.replace("Premium: ", "") || "";
    const exp = parts.find((p) => p.startsWith("Exp"))?.replace("Exp: ", "") || "";
    return { action: "SOLD CALL", details: `${strike} strike, exp ${exp}`, premium };
  }
  if (msg.startsWith("CLOSED")) {
    return { action: "CLOSED", details: msg, premium: "" };
  }
  if (msg.startsWith("ASSIGNMENT")) {
    return { action: "ASSIGNED", details: msg.replace("ASSIGNMENT: ", ""), premium: "" };
  }
  if (msg.startsWith("CYCLE")) {
    const pnl = msg.match(/\$[\d.]+/)?.[0] || "";
    return { action: "CYCLE DONE", details: msg, premium: pnl };
  }
  return { action: "INFO", details: msg, premium: "" };
}

// ── Shared components ──

function Loading() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-zinc-800 rounded-lg p-3 animate-pulse h-16" />
      ))}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-center text-zinc-500 py-8 text-sm">{msg}</div>;
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex justify-center gap-2 mt-4">
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 bg-zinc-800 rounded-lg text-xs disabled:opacity-30 hover:bg-zinc-700 text-zinc-300">← Prev</button>
      <span className="px-3 py-1.5 text-xs text-zinc-500">{page} / {totalPages}</span>
      <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1.5 bg-zinc-800 rounded-lg text-xs disabled:opacity-30 hover:bg-zinc-700 text-zinc-300">Next →</button>
    </div>
  );
}

// ── Main Page ──

export default function TradesPage() {
  const [tab, setTab] = useState<"positions" | "activity">("positions");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Trade Log</h1>

      {/* Tab switcher */}
      <div className="flex bg-zinc-800 rounded-lg p-1 gap-1">
        <button
          onClick={() => setTab("positions")}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "positions" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          Positions
        </button>
        <button
          onClick={() => setTab("activity")}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "activity" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          Activity
        </button>
      </div>

      {tab === "positions" ? <PositionsTab /> : <ActivityTab />}
    </div>
  );
}
