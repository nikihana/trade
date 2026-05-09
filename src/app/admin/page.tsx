"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AddTickerDialog } from "../components/AddTickerDialog";
import { usePortfolio, refreshAll } from "@/lib/hooks";

interface ConfigRow {
  key: string;
  value: string;
  label: string;
  description: string | null;
  type: string;
}

const categories: { title: string; keys: string[] }[] = [
  { title: "Trading", keys: ["put_strike_pct", "call_strike_pct", "strike_range", "profit_target_pct"] },
  { title: "Expiration", keys: ["min_expiration_weeks", "target_expiration_weeks", "max_expiration_weeks"] },
  { title: "Risk Management", keys: ["stop_loss_pct", "max_position_pct", "min_cash_pct", "min_premium_pct", "min_call_premium"] },
  { title: "Market & Screening", keys: ["market_check_enabled", "min_avg_volume", "approved_tickers", "excluded_tickers"] },
  { title: "Bear Market Protection", keys: ["vix_halt_threshold", "bear_drop_pct", "spread_width", "hedge_pct", "defensive_max_dte", "cautious_size_pct"] },
  { title: "Schedule & Health", keys: ["cron_schedule", "healthcheck_url", "realized_pl_verified"] },
];

const fullWidthKeys = new Set(["healthcheck_url", "cron_schedule", "approved_tickers", "excluded_tickers"]);

function Section({
  title,
  subtitle,
  helper,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  helper?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {title}
            {subtitle && <span className="ml-2 text-[10px] text-zinc-500 font-normal">{subtitle}</span>}
          </h2>
          {helper && <p className="text-xs text-zinc-500 mt-0.5">{helper}</p>}
        </div>
        {badge}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

function ManualActionButton({
  label,
  subtitle,
  endpoint,
  color,
  body,
  onResult,
}: {
  label: string;
  subtitle: string;
  endpoint: string;
  color: "green" | "blue" | "purple";
  body?: Record<string, unknown>;
  onResult: (result: { success: boolean; logs: string[] }) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleRun() {
    setLoading(true);
    onResult({ success: true, logs: [] });
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      onResult({ success: data.success !== false, logs: data.logs || [data.error || "Done"] });
      refreshAll();
    } catch (err) {
      onResult({ success: false, logs: [err instanceof Error ? err.message : "Request failed"] });
    } finally {
      setLoading(false);
    }
  }

  const colors = {
    green: loading ? "bg-green-800 text-green-300 animate-pulse" : "bg-green-600 hover:bg-green-500 text-white",
    blue: loading ? "bg-blue-800 text-blue-300 animate-pulse" : "bg-blue-600 hover:bg-blue-500 text-white",
    purple: loading ? "bg-purple-800 text-purple-300 animate-pulse" : "bg-purple-600 hover:bg-purple-500 text-white",
  };

  return (
    <button
      onClick={handleRun}
      disabled={loading}
      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${colors[color]}`}
    >
      <div>{loading ? "Running…" : label}</div>
      <div className="text-[10px] opacity-70 font-normal">{subtitle}</div>
    </button>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: portfolio } = usePortfolio();

  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [configError, setConfigError] = useState("");

  const [actionResult, setActionResult] = useState<{ success: boolean; logs: string[] } | null>(null);

  const [auditReport, setAuditReport] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const [migrateLoading, setMigrateLoading] = useState(false);

  const plVerified: boolean = portfolio?.plVerified ?? false;

  // Bounce non-admins to dashboard
  useEffect(() => {
    if (status === "authenticated" && !session?.user?.isAdmin) {
      router.replace("/");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.isAdmin) return;
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
  }, [status, session]);

  if (status === "loading" || (status === "authenticated" && !session?.user?.isAdmin)) {
    return null;
  }

  async function saveConfig() {
    setSaving(true);
    setConfigError("");
    setSaved(false);
    try {
      const updates = Object.entries(values).map(([key, value]) => ({ key, value }));
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refreshAll();
    } catch {
      setConfigError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function runAudit() {
    setAuditLoading(true);
    setAuditReport(null);
    try {
      const res = await fetch("/api/admin/audit-pnl");
      const text = await res.text();
      setAuditReport(text);
    } catch (err) {
      setAuditReport(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setAuditLoading(false);
    }
  }

  async function markVerified() {
    setVerifyLoading(true);
    try {
      const res = await fetch("/api/admin/verify-pnl", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Verify failed");
      }
      refreshAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setVerifyLoading(false);
    }
  }

  async function runMigration() {
    setMigrateLoading(true);
    setMigrateResult(null);
    try {
      const res = await fetch("/api/admin/migrate", { method: "POST" });
      const data = await res.json();
      setMigrateResult(data.message || data.error || "Done");
    } catch (err) {
      setMigrateResult(err instanceof Error ? err.message : "Migration failed");
    } finally {
      setMigrateLoading(false);
    }
  }

  const configMap = new Map(config.map((c) => [c.key, c]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Admin</h1>

      {/* a. Positions */}
      <Section
        title="Positions"
        helper="Add a ticker outside the screener flow. The approval queue on the Dashboard is the preferred path."
      >
        <AddTickerDialog />
      </Section>

      {/* b. Manual actions */}
      <Section
        title="Manual actions"
        subtitle="debug · normally cron-driven"
        helper="Trigger what the cron jobs do automatically. Useful for diagnostics; not needed for normal operation."
      >
        <div className="flex gap-2">
          <ManualActionButton
            label="Run tick"
            subtitle="one trading cycle now"
            endpoint="/api/bot/tick"
            color="green"
            onResult={setActionResult}
          />
          <ManualActionButton
            label="Run screen"
            subtitle="re-screen universe"
            endpoint="/api/bot/screen"
            color="blue"
            onResult={setActionResult}
          />
          <ManualActionButton
            label="Morning check"
            subtitle="re-evaluate regime"
            endpoint="/api/bot/morning"
            color="purple"
            onResult={setActionResult}
          />
        </div>
        {actionResult && actionResult.logs.length > 0 && (
          <div
            className={`mt-3 rounded-lg p-3 text-xs font-mono space-y-1 max-h-48 overflow-y-auto ${
              actionResult.success
                ? "bg-green-900/30 border border-green-800 text-green-300"
                : "bg-red-900/30 border border-red-800 text-red-300"
            }`}
          >
            {actionResult.logs.map((log, i) => (
              <p key={i}>{log}</p>
            ))}
          </div>
        )}
      </Section>

      {/* c. P&L verification */}
      <Section
        title="P&L verification"
        helper="Reconcile every closed contract against the broker. Read-only; suggestions never auto-apply."
        badge={
          plVerified ? (
            <span className="text-[10px] bg-green-900/40 text-green-400 px-2 py-0.5 rounded border border-green-700/50 font-medium">
              Verified
            </span>
          ) : (
            <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded border border-yellow-700/50 font-medium">
              Unverified
            </span>
          )
        }
      >
        <div className="flex gap-2">
          <button
            onClick={runAudit}
            disabled={auditLoading}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-50"
          >
            {auditLoading ? "Running…" : "Run audit"}
          </button>
          <button
            onClick={markVerified}
            disabled={verifyLoading || plVerified}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-green-700 hover:bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {plVerified ? "Already verified" : verifyLoading ? "Saving…" : "Mark as verified"}
          </button>
        </div>
        {auditReport && (
          <pre className="mt-3 rounded-lg bg-zinc-900 border border-zinc-700 p-3 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
            {auditReport}
          </pre>
        )}
      </Section>

      {/* d. Configuration */}
      <Section title="Configuration">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-zinc-900 rounded-lg p-3 animate-pulse h-12" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {categories.map((cat) => (
              <div key={cat.title} className="bg-zinc-900/40 rounded-lg border border-zinc-700/50 overflow-hidden">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider px-3 pt-3 pb-1">
                  {cat.title}
                </h3>
                <div className="divide-y divide-zinc-700/30">
                  {cat.keys.map((key) => {
                    const row = configMap.get(key);
                    if (!row) return null;
                    const isFullWidth = fullWidthKeys.has(key);
                    return (
                      <div key={key} className="px-3 py-2.5">
                        {isFullWidth ? (
                          <div>
                            <label className="text-sm font-medium text-white block">{row.label}</label>
                            {row.description && (
                              <p className="text-xs text-zinc-500 mt-0.5 mb-2">{row.description}</p>
                            )}
                            <input
                              type="text"
                              value={values[key] || ""}
                              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                              className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <label className="text-sm font-medium text-white block">{row.label}</label>
                              {row.description && (
                                <p className="text-xs text-zinc-500 mt-0.5">{row.description}</p>
                              )}
                            </div>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={values[key] || ""}
                              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                              className="w-28 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white text-right font-mono focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {configError && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-red-300 text-sm">
                {configError}
              </div>
            )}

            <button
              onClick={saveConfig}
              disabled={saving}
              className={`w-full py-2.5 rounded-lg font-medium transition-all text-sm ${
                saved
                  ? "bg-green-600 text-white"
                  : saving
                    ? "bg-blue-800 text-blue-300 animate-pulse"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {saved ? "Saved" : saving ? "Saving…" : "Save Configuration"}
            </button>
          </div>
        )}
      </Section>

      {/* e. System */}
      <Section title="System" helper="Schema migrations and low-level operations.">
        <button
          onClick={runMigration}
          disabled={migrateLoading}
          className="w-full py-2 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-50"
        >
          {migrateLoading ? "Running…" : "Run migration"}
        </button>
        {migrateResult && (
          <div className="mt-2 text-xs text-zinc-400 font-mono">{migrateResult}</div>
        )}
      </Section>

      <p className="text-xs text-zinc-600 text-center pt-2">All times shown in PST.</p>
    </div>
  );
}
