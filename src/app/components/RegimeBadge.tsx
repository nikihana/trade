"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const regimeColors: Record<string, { bg: string; text: string; dot: string }> = {
  NORMAL: { bg: "bg-green-900/30", text: "text-green-300", dot: "bg-green-400" },
  CAUTIOUS: { bg: "bg-yellow-900/30", text: "text-yellow-300", dot: "bg-yellow-400" },
  DEFENSIVE: { bg: "bg-orange-900/30", text: "text-orange-300", dot: "bg-orange-400" },
  HALT: { bg: "bg-red-900/30", text: "text-red-300", dot: "bg-red-500" },
  BEAR: { bg: "bg-red-900/40", text: "text-red-200", dot: "bg-red-600" },
};

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

export function RegimeBadge() {
  const { data, isLoading } = useSWR("/api/regime", fetcher, {
    refreshInterval: 60000,
  });

  if (isLoading) {
    return <div className="bg-zinc-800 rounded-xl p-4 animate-pulse h-20" />;
  }

  if (!data || data.error) return null;

  const colors = regimeColors[data.regime] || regimeColors.NORMAL;

  return (
    <div className={`${colors.bg} rounded-xl p-4 border border-zinc-700`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <span className={`text-sm font-bold ${colors.text}`}>
            {data.regime}
          </span>
        </div>
        <span className="text-xs text-zinc-400">VIX {data.vix}</span>
      </div>
      <p className="text-xs text-zinc-400">{data.reason}</p>
      <div className="flex gap-4 mt-2 text-[10px] text-zinc-500">
        <span>SPY {fmt(data.spyPrice)}</span>
        <span>50MA {fmt(data.sma50)}</span>
        {data.sma200 > 0 && <span>200MA {fmt(data.sma200)}</span>}
        {data.drawdownPct > 0 && (
          <span className="text-red-400">
            -{(data.drawdownPct * 100).toFixed(1)}% from high
          </span>
        )}
      </div>
    </div>
  );
}
