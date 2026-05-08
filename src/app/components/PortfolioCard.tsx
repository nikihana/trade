"use client";

import { usePortfolio } from "@/lib/hooks";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function PortfolioCard() {
  const { data, error, isLoading } = usePortfolio();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-zinc-800 rounded-xl p-4 animate-pulse h-20"
          />
        ))}
      </div>
    );
  }

  if (error || !data || data.error) {
    return (
      <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
        {data?.error || "Failed to load portfolio. Check your Alpaca API keys."}
      </div>
    );
  }

  const plVerified: boolean = data.plVerified ?? false;

  const stats: Array<{
    label: string;
    value: string;
    color: string;
    unverified?: boolean;
  }> = [
    { label: "Cash", value: fmt(data.account.cash), color: "text-white" },
    { label: "Equity", value: fmt(data.account.equity), color: "text-white" },
    { label: "Premium", value: fmt(data.totalPremium), color: "text-green-400" },
    {
      label: "Realized P&L",
      value: fmt(data.totalRealizedPL),
      color: data.totalRealizedPL >= 0 ? "text-green-400" : "text-red-400",
      unverified: !plVerified,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-zinc-800 rounded-xl p-4 border border-zinc-700"
        >
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">
              {stat.label}
            </p>
            {stat.unverified && (
              <span
                title="Unverified — pending historical reconciliation. Run /api/admin/audit-pnl, review the report, then set realized_pl_verified=true in Config."
                className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-700/50 cursor-help"
              >
                unverified
              </span>
            )}
          </div>
          <p className={`text-lg font-bold mt-1 ${stat.color}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
