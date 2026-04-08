"use client";

import { useState } from "react";

const VERSION = "v1.000006";

const CHANGELOG = `## v1.000006 — 2026-04-08
- Add version footer with changelog viewer
- Info button opens scrollable changelog modal

## v1.000005 — 2026-04-08
- Add authentication with login screen
- NextAuth.js credentials provider (email + password)
- Middleware protects all routes, redirects to /login
- First-time password setup at /setup
- Sign-out button in header

## v1.000004 — 2026-04-08
- Add Alpaca position/order data to ticker detail page
- Open positions table (asset, price, qty, market value, P&L)
- Recent orders table (type, side, qty, filled, avg price, status)
- Auto-refresh every 15 seconds

## v1.000003 — 2026-04-08
- Add Run Bot Tick button for on-demand trading from Vercel
- POST /api/bot/tick runs one full wheel engine cycle
- Real-time log output on dashboard

## v1.000002 — 2026-04-08
- Switch from SQLite to Neon PostgreSQL
- PrismaPg adapter for Vercel serverless compatibility

## v1.000001 — 2026-04-08
- Initial release: Wheel Strategy Trading App
- Alpaca paper trading API integration
- Bot engine: sell puts, detect assignment, sell calls, detect call-away
- Mobile-first dashboard with portfolio overview
- Ticker management, trade log, daily summary
- Prisma ORM with PostgreSQL`;

function parseChangelog(raw: string) {
  return raw.split(/^## /m).filter(Boolean).map((block) => {
    const [title, ...lines] = block.trim().split("\n");
    return {
      title: title.trim(),
      items: lines
        .map((l) => l.replace(/^- /, "").trim())
        .filter(Boolean),
    };
  });
}

export function VersionFooter() {
  const [open, setOpen] = useState(false);
  const entries = parseChangelog(CHANGELOG);

  return (
    <>
      {/* Footer */}
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-zinc-600">
        <span className="font-mono">{VERSION}</span>
        <button
          onClick={() => setOpen(true)}
          className="w-5 h-5 rounded-full border border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center text-[10px] font-bold"
          aria-label="View changelog"
        >
          i
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h2 className="text-sm font-bold text-white">
                Changelog
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white text-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto px-4 py-3 space-y-4">
              {entries.map((entry, i) => (
                <div key={i}>
                  <h3 className="text-xs font-bold text-blue-400 mb-1">
                    {entry.title}
                  </h3>
                  <ul className="space-y-0.5">
                    {entry.items.map((item, j) => (
                      <li
                        key={j}
                        className="text-xs text-zinc-400 pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-zinc-600"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
