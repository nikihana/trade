"use client";

import { TradeLogTable } from "@/app/components/TradeLogTable";

export default function TradesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Trade Log</h1>
      <TradeLogTable />
    </div>
  );
}
