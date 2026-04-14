# Changelog

## v1.000036 — 2026-04-14
- Cancel-and-replace API: POST /api/tickers/[symbol]/replace cancels pending order and submits new one
- Capital deployment now calculated dynamically from Alpaca positions on every refresh
- Deployed capital = sum of (strike price x 100) for each open short put confirmed by Alpaca
- If Alpaca reports no open positions, deployed capital shows $0 — local state never overrides broker

## v1.000035 — 2026-04-11
- Clear P&L breakdown on each position: Collected / To close now / Net if closed
- Green = in profit, red = at a loss — instant visual
- PENDING orders show "Est. premium" with note "No premium collected until order fills"
- Removed confusing livePL number from card header
- ITM/OTM indicator with % distance from strike

## v1.000034 — 2026-04-11
- Option status indicator: green dot + OTM or red dot + ITM on each contract
- Shows stock price vs strike with % distance
- Option mid price displayed on contract row
- Updated banners: "Limit sell/buy order open — waiting to fill" (not "executes at market open")
- Stock price fetched per ticker in API response

## v1.000033 — 2026-04-09
- Delete src/bot/ directory (dead code — everything runs via Vercel cron)
- Remove bot/bot:dev scripts and tsx dependency from package.json

## v1.000032 — 2026-04-09
- Remove all remaining polling (RegimeBadge 60s, Trades page 30s)
- Zero background API calls — everything is action-triggered or page-load only

## v1.000031 — 2026-04-09
- Remove dead dashboard_refresh_min config (polling was already removed)
- Dashboard refreshes on: page load, tab focus, and after actions only

## v1.000030 — 2026-04-09
- Pending open/close banners: blue "Pending open" for unfilled sell orders, yellow "Pending close" for queued close orders
- Status badges: OPENING (blue), OPEN (green), CLOSING (yellow)
- Removed QQQ (too expensive for account size)

## v1.000029 — 2026-04-09
- Close uses liquidation during market hours, limit+GTC after hours
- After-hours close queues order and shows "executes at market open 9:30 AM ET"

## v1.000028 — 2026-04-09
- Order lifecycle fix: new orders start as PENDING, not OPEN
- Premium only counted after Alpaca confirms fill (reconciliation)
- Prevents phantom premium on unfilled GTC limit orders

## v1.000027 — 2026-04-09
- Liquidate positions via Alpaca DELETE /v2/positions API
- Simpler than buy-to-close orders (when market is open)

## v1.000026 — 2026-04-09
- Fix 5 bugs: premium double-counting, position sync on load, SPY $0 data, realized P&L, pending close state
- Portfolio premium only sums active cycles
- Tickers endpoint reconciles with Alpaca on every page load
- SPY fallback to live quote when bars return empty

## v1.000025 — 2026-04-09
- Capital bar uses Alpaca options_buying_power (not stock buying_power)
- Tick engine uses options buying power for trade eligibility

## v1.000024 — 2026-04-09
- Root cause fix: close orders verified before marking DB closed
- Position reconciliation on every tick: detect mismatches, flag FAILED_CLOSE
- FAILED_CLOSE shows red warning banner on ticker card

## v1.000023 — 2026-04-09
- BLOCKED badge on pending tickers with guard reason on hover
- API checks guards for pending tickers (premium, allocation, risk cap)

## v1.000022 — 2026-04-08
- Per-ticker allocation overrides global risk cap
- If allocation covers position size, skip global 20% cap (still checks cash floor)

## v1.000021 — 2026-04-08
- Override Guards toggle for paper trading
- Checkbox bypasses risk caps, premium checks, HALT regime
- Yellow lightning bolt button when active

## v1.000020 — 2026-04-08
- Prevent duplicate orders by checking Alpaca open orders before placing new ones
- Extracts underlying symbol from OCC option symbols

## v1.000019 — 2026-04-08
- Weekly screener: screens ~100 S&P 500/Nasdaq 100 tickers
- Filters: price $50-$300, IV percentile >35%, OI >1000, no earnings within 35 days
- Morning check: regime status, 50% profit alerts, earnings proximity warnings
- Three test buttons: Run Tick, Run Screen, Morning Check
- CandidatesCard dashboard component with weekly picks table

## v1.000018 — 2026-04-08
- Live P&L on ticker cards and close confirmation modal
- Net P&L breakdown: premium collected vs buyback cost

## v1.000017 — 2026-04-08
- Add Position form: symbol, allocation ($), strike preference dropdown
- Capital deployment progress bar (deployed vs available)
- Close button per position with confirmation modal
- Edit allocation modal

## v1.000016 — 2026-04-08
- Bear market protection: 5 regime modes (NORMAL, CAUTIOUS, DEFENSIVE, HALT, BEAR)
- VIX from Yahoo Finance, SPY 50/200-day MAs
- Multi-leg order support (bull put spreads, bear call spreads, iron condors)
- RegimeBadge on dashboard with color-coded status

## v1.000015 — 2026-04-08
- 8 trading guardrails: stock screening, IV proxy, stop-loss, risk caps, market condition
- Guards logged with reasons to trade log
- Historical bars API from Alpaca

## v1.000014 — 2026-04-08
- Trades page redesigned: Positions tab (tick snapshots) + Activity tab (trades)
- Sorted by symbol, parsed action types, color-coded badges

## v1.000013 — 2026-04-08
- Config page: full-width URL fields, PST timestamps, refresh in minutes
- All timestamps display in America/Los_Angeles timezone

## v1.000012 — 2026-04-08
- External cron via cron-job.org (replaces Vercel cron)
- Healthchecks.io integration for monitoring

## v1.000011 — 2026-04-08
- Tick snapshot logging on every run (account + position state)
- Config page with 9 configurable parameters
- Config-driven options logic (strike %, expiration, profit target)

## v1.000010 — 2026-04-08
- Vercel Cron Job: bot runs every 15 min during market hours
- Cron endpoint with CRON_SECRET auth

## v1.000009 — 2026-04-08
- PWA manifest for iPhone home screen
- Standalone display mode, dark theme

## v1.000008 — 2026-04-08
- Clean single-row header with logo
- Predixeum favicon and apple-touch-icon
- Removed emoji nav, template SVGs

## v1.000007 — 2026-04-08
- Remove Prisma, switch to raw Neon SQL queries
- Fixes Edge middleware auth failure

## v1.000006 — 2026-04-08
- Version footer with changelog viewer
- Info button opens scrollable changelog modal

## v1.000005 — 2026-04-08
- Authentication with login screen (NextAuth.js)
- Password setup, session management, sign-out

## v1.000004 — 2026-04-08
- Alpaca position/order data on ticker detail page

## v1.000003 — 2026-04-08
- Run Bot Tick button for on-demand trading from Vercel

## v1.000002 — 2026-04-08
- Switch from SQLite to Neon PostgreSQL

## v1.000001 — 2026-04-08
- Initial release: Wheel Strategy Trading App
