"use client";

import { useState } from "react";
import { useCandidates, usePortfolio, refreshAll } from "@/lib/hooks";

const YIELD_WEIGHTS = [0.30, 0.25, 0.20, 0.15, 0.10];

function computeAllocation(equity: number, yieldRank: number): number {
  const pool = equity * 0.70;
  const weight = YIELD_WEIGHTS[yieldRank - 1] ?? 0.10;
  const raw = pool * weight;
  const capped = Math.min(raw, equity * 0.20);
  return Math.floor(capped / 1000) * 1000;
}

function fmtK(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

interface Candidate {
  id: string;
  symbol: string;
  premium: number;
  premiumYield: number;
  suggestedStrike: number;
  yieldRank: number;
  status: string;
  daysToEarnings: number | null;
}

export function PendingApprovalsCard() {
  const { data: candData } = useCandidates();
  const { data: portfolio } = usePortfolio();
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, "approved" | "rejected">>({});

  const proposed: Candidate[] = (candData?.candidates ?? []).filter(
    (c: Candidate) => c.status === "proposed" && !done[c.id]
  );

  if (proposed.length === 0) return null;

  const equity: number = portfolio?.account?.equity ?? 0;

  async function handleApprove(id: string) {
    setLoading((l) => ({ ...l, [id]: true }));
    try {
      const res = await fetch(`/api/candidates/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to approve");
        return;
      }
      setDone((d) => ({ ...d, [id]: "approved" }));
      refreshAll();
    } finally {
      setLoading((l) => ({ ...l, [id]: false }));
    }
  }

  async function handleReject(id: string) {
    setLoading((l) => ({ ...l, [id]: true }));
    try {
      const res = await fetch(`/api/candidates/${id}/reject`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to reject");
        return;
      }
      setDone((d) => ({ ...d, [id]: "rejected" }));
      refreshAll();
    } finally {
      setLoading((l) => ({ ...l, [id]: false }));
    }
  }

  return (
    <div className="bg-zinc-800 rounded-xl border border-yellow-700/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center gap-2">
        <span className="text-xs text-yellow-400 uppercase tracking-wider font-medium">
          Pending Approvals
        </span>
        <span className="bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          {proposed.length}
        </span>
      </div>

      <div className="divide-y divide-zinc-700/30">
        {proposed.map((c) => {
          const allocation = equity > 0 ? computeAllocation(equity, c.yieldRank) : 0;
          const busy = loading[c.id] ?? false;

          return (
            <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{c.symbol}</span>
                  <span className="text-[10px] text-zinc-500">#{c.yieldRank}</span>
                  {c.daysToEarnings !== null && c.daysToEarnings <= 14 && (
                    <span className="text-[10px] text-yellow-400">{c.daysToEarnings}d earn.</span>
                  )}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5 space-x-3">
                  <span className="text-green-400 font-medium">
                    {(c.premiumYield * 100).toFixed(1)}% yield
                  </span>
                  <span>prem ${c.premium.toFixed(0)}</span>
                  <span>strike ${c.suggestedStrike}</span>
                  {allocation > 0 && (
                    <span className="text-zinc-300">→ alloc {fmtK(allocation)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleReject(c.id)}
                  disabled={busy}
                  className="text-xs text-zinc-400 hover:text-red-400 border border-zinc-600 hover:border-red-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleApprove(c.id)}
                  disabled={busy}
                  className="text-xs text-white bg-green-700 hover:bg-green-600 active:bg-green-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 font-medium"
                >
                  {busy ? "…" : "Approve"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
