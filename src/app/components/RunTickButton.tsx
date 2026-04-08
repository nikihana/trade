"use client";

import { useState } from "react";
import { refreshAll } from "@/lib/hooks";

function ActionButton({
  label,
  loadingLabel,
  endpoint,
  method = "POST",
  color,
  onResult,
}: {
  label: string;
  loadingLabel: string;
  endpoint: string;
  method?: "POST" | "GET";
  color: string;
  onResult: (result: { success: boolean; logs: string[] }) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleRun() {
    setLoading(true);
    onResult({ success: true, logs: [] });

    try {
      const res = await fetch(endpoint, { method });
      const data = await res.json();
      onResult({ success: data.success !== false, logs: data.logs || [data.error || "Done"] });
      refreshAll();
    } catch (err) {
      onResult({
        success: false,
        logs: [err instanceof Error ? err.message : "Request failed"],
      });
    } finally {
      setLoading(false);
    }
  }

  const colors: Record<string, string> = {
    green: loading ? "bg-green-800 text-green-300 animate-pulse" : "bg-green-600 hover:bg-green-500 active:bg-green-700 text-white",
    blue: loading ? "bg-blue-800 text-blue-300 animate-pulse" : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white",
    purple: loading ? "bg-purple-800 text-purple-300 animate-pulse" : "bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white",
  };

  return (
    <button
      onClick={handleRun}
      disabled={loading}
      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${colors[color] || colors.green}`}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

export function RunTickButton() {
  const [result, setResult] = useState<{ success: boolean; logs: string[] } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <ActionButton
          label="Run Tick"
          loadingLabel="Running..."
          endpoint="/api/bot/tick"
          color="green"
          onResult={setResult}
        />
        <ActionButton
          label="Run Screen"
          loadingLabel="Screening..."
          endpoint="/api/bot/screen"
          color="blue"
          onResult={setResult}
        />
        <ActionButton
          label="Morning Check"
          loadingLabel="Checking..."
          endpoint="/api/bot/morning"
          color="purple"
          onResult={setResult}
        />
      </div>

      {result && result.logs.length > 0 && (
        <div
          className={`rounded-xl p-3 text-xs font-mono space-y-1 max-h-48 overflow-y-auto ${
            result.success
              ? "bg-green-900/30 border border-green-800 text-green-300"
              : "bg-red-900/30 border border-red-800 text-red-300"
          }`}
        >
          {result.logs.map((log, i) => (
            <p key={i}>{log}</p>
          ))}
        </div>
      )}
    </div>
  );
}
