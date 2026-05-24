/**
 * Per-contract contribution to WheelCycle.realizedPL, mirroring production
 * code paths exactly (see verification report). Returns 0 for any closedReason
 * that production does NOT propagate.
 *
 * Pure function — no DB, no network. The single source of truth for how a
 * closed contract maps to realized P&L. Tested in pnl.test.ts.
 *
 * Production reconciler (tick-engine.ts PENDING_CLOSE → CLOSED) applies
 * realizedPL += (premium - closePrice) for every close it confirms, regardless
 * of closedReason. So MANUAL, STOP_LOSS, and PROFIT_TARGET all contribute.
 * CANCELLED (never filled), EXPIRATION (worthless sweep), and ASSIGNED
 * (handled at cycle level via call-away) contribute 0.
 */
export function realizedPLContribution(
  status: string,
  closedReason: string | null,
  premium: number,
  closePrice: number | null
): number {
  if (
    status === "CLOSED" &&
    (closedReason === "MANUAL" ||
      closedReason === "STOP_LOSS" ||
      closedReason === "PROFIT_TARGET")
  ) {
    return premium - (closePrice ?? 0);
  }
  // PENDING cancellation — order never filled, no money changed hands
  if (status === "CLOSED" && closedReason === "CANCELLED") return 0;
  // Worthless expiry — production sweep does not touch realizedPL
  if (status === "EXPIRED" && closedReason === "EXPIRATION") return 0;
  // Assignment — handled by cycle-level call-away logic, not per-contract
  if (status === "ASSIGNED") return 0;
  // Anything else: zero contribution. Caller should flag for review.
  return 0;
}

/** Parse strike price from an OCC option symbol (e.g. AMD260424P00210000 → 210). */
export function parseStrikeFromOCC(symbol: string): number {
  // OCC format: ROOT(variable) + YYMMDD(6) + P/C(1) + strike*1000(8 digits)
  const match = symbol.match(/[A-Z]+(\d{6})[PC](\d{8})$/);
  if (!match) return 0;
  return parseInt(match[2], 10) / 1000;
}
