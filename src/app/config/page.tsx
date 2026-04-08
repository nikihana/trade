"use client";

import { useState, useEffect } from "react";

interface ConfigRow {
  key: string;
  value: string;
  label: string;
  description: string | null;
  type: string;
}

const categories: { title: string; keys: string[] }[] = [
  {
    title: "Trading",
    keys: [
      "put_strike_pct",
      "call_strike_pct",
      "strike_range",
      "profit_target_pct",
    ],
  },
  {
    title: "Expiration",
    keys: [
      "min_expiration_weeks",
      "target_expiration_weeks",
      "max_expiration_weeks",
    ],
  },
  {
    title: "Risk Management",
    keys: [
      "stop_loss_pct",
      "max_position_pct",
      "min_cash_pct",
      "min_premium_pct",
      "min_call_premium",
    ],
  },
  {
    title: "Market & Screening",
    keys: [
      "market_check_enabled",
      "min_avg_volume",
      "approved_tickers",
    ],
  },
  {
    title: "Schedule & UI",
    keys: ["cron_schedule", "dashboard_refresh_min", "healthcheck_url"],
  },
];

// Keys where the input should be full-width below the label
const fullWidthKeys = new Set(["healthcheck_url", "cron_schedule", "approved_tickers"]);

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setConfig(data);
          const vals: Record<string, string> = {};
          data.forEach((c: ConfigRow) => (vals[c.key] = c.value));
          setValues(vals);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const updates = Object.entries(values).map(([key, value]) => ({
        key,
        value,
      }));
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-zinc-800 rounded-xl p-4 animate-pulse h-16" />
        ))}
      </div>
    );
  }

  const configMap = new Map(config.map((c) => [c.key, c]));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Configuration</h1>

      {categories.map((cat) => (
        <section key={cat.title} className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider px-4 pt-4 pb-2">
            {cat.title}
          </h2>
          <div className="divide-y divide-zinc-700/50">
            {cat.keys.map((key) => {
              const row = configMap.get(key);
              if (!row) return null;
              const isFullWidth = fullWidthKeys.has(key);

              return (
                <div key={key} className="px-4 py-3">
                  {isFullWidth ? (
                    /* Full-width layout: label on top, input below */
                    <div>
                      <label className="text-sm font-medium text-white block">
                        {row.label}
                      </label>
                      {row.description && (
                        <p className="text-xs text-zinc-500 mt-0.5 mb-2">
                          {row.description}
                        </p>
                      )}
                      <input
                        type="text"
                        value={values[key] || ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [key]: e.target.value }))
                        }
                        className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  ) : (
                    /* Inline layout: label left, input right */
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <label className="text-sm font-medium text-white block">
                          {row.label}
                        </label>
                        {row.description && (
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {row.description}
                          </p>
                        )}
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={values[key] || ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [key]: e.target.value }))
                        }
                        className="w-28 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white text-right font-mono focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full py-3 rounded-xl font-medium transition-all ${
          saved
            ? "bg-green-600 text-white"
            : saving
              ? "bg-blue-800 text-blue-300 animate-pulse"
              : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white"
        }`}
      >
        {saved ? "Saved" : saving ? "Saving..." : "Save Configuration"}
      </button>

      <p className="text-xs text-zinc-600 text-center">
        All times shown in PST.
      </p>
    </div>
  );
}
