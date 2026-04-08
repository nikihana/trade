"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useOptionsChain } from "@/lib/hooks";
import { format, addWeeks } from "date-fns";

export default function OptionsChainPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const [optionType, setOptionType] = useState<string>("put");

  const now = new Date();
  const { data: contracts, isLoading } = useOptionsChain(
    symbol.toUpperCase(),
    {
      type: optionType,
      exp_gte: format(addWeeks(now, 1), "yyyy-MM-dd"),
      exp_lte: format(addWeeks(now, 5), "yyyy-MM-dd"),
      limit: "30",
    }
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/ticker/${symbol}`}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-bold">
          {symbol.toUpperCase()} Options
        </h1>
      </div>

      {/* Type toggle */}
      <div className="flex bg-zinc-800 rounded-lg p-1 gap-1">
        {["put", "call"].map((type) => (
          <button
            key={type}
            onClick={() => setOptionType(type)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              optionType === type
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {type === "put" ? "📉 Puts" : "📈 Calls"}
          </button>
        ))}
      </div>

      {/* Contracts list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="bg-zinc-800 rounded-lg p-3 animate-pulse h-16"
            />
          ))}
        </div>
      ) : contracts?.length > 0 ? (
        <div className="space-y-2">
          {contracts.map(
            (c: {
              id: string;
              symbol: string;
              strikePrice: number;
              expirationDate: string;
              openInterest: number;
            }) => (
              <div
                key={c.id}
                className="bg-zinc-800 rounded-lg p-3 border border-zinc-700"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">
                    ${c.strikePrice} Strike
                  </span>
                  <span className="text-xs text-zinc-400">
                    Exp{" "}
                    {new Date(c.expirationDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "America/Los_Angeles",
                    })}
                  </span>
                </div>
                <div className="flex justify-between mt-1 text-xs text-zinc-500">
                  <span className="font-mono truncate max-w-[60%]">
                    {c.symbol}
                  </span>
                  <span>OI: {c.openInterest}</span>
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-500">
          <p>No {optionType} contracts found for this date range</p>
        </div>
      )}
    </div>
  );
}
