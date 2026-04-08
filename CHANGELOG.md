# Changelog

## v1.000006 — 2026-04-08
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
- Prisma ORM with PostgreSQL
