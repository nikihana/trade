import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the config module so guard thresholds are deterministic and no DB is hit.
const configValues: Record<string, number> = {};
vi.mock("./config", () => ({
  getConfig: vi.fn(async () => null),
  getConfigNum: vi.fn(async (key: string, fallback: number) =>
    key in configValues ? configValues[key] : fallback
  ),
}));

// Mock alpaca so guards that touch historical bars never hit the network.
vi.mock("./alpaca", () => ({
  getHistoricalBars: vi.fn(async () => []),
  getLatestQuote: vi.fn(async () => ({ lastPrice: 0, bidPrice: 0, askPrice: 0 })),
}));

import {
  checkStopLoss,
  checkRiskCap,
  checkPremiumRichness,
  checkCallPremium,
} from "./guards";

beforeEach(() => {
  for (const k of Object.keys(configValues)) delete configValues[k];
});

describe("checkStopLoss — protects against deep-ITM assignment", () => {
  it("allows when price is above the stop threshold", async () => {
    // default stop_loss_pct = 0.15 → threshold = strike * 0.85
    const r = await checkStopLoss(95, 100); // 95 > 85
    expect(r.allowed).toBe(true);
  });

  it("triggers (allowed=false) when price drops below the stop threshold", async () => {
    const r = await checkStopLoss(80, 100); // 80 < 85
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/STOP-LOSS/);
  });

  it("respects a custom stop_loss_pct", async () => {
    configValues["stop_loss_pct"] = 0.05; // threshold = strike * 0.95
    const r = await checkStopLoss(92, 100); // 92 < 95 → trips
    expect(r.allowed).toBe(false);
  });
});

describe("checkRiskCap — position sizing + cash floor", () => {
  it("blocks when position exceeds the max-position cap", async () => {
    // default max_position_pct = 0.20 → maxPosition = equity*0.2 = 2000
    // strike 100 → positionSize = 100*100 = 10000 > 2000
    const r = await checkRiskCap(100, 10000, 5000);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/exceeds/);
  });

  it("blocks when cash after trade is below the min-cash floor", async () => {
    // equity 100000 → maxPosition 20000; strike 100 → posSize 10000 (ok)
    // min_cash_pct 0.30 → minCash 30000; cashAfter 20000 < 30000 → blocked
    const r = await checkRiskCap(100, 100000, 20000);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Cash after trade/);
  });

  it("allows when within both position cap and cash floor", async () => {
    // equity 100000 → maxPosition 20000; strike 100 → posSize 10000 ok
    // cashAfter 50000 > minCash 30000 → allowed
    const r = await checkRiskCap(100, 100000, 50000);
    expect(r.allowed).toBe(true);
  });
});

describe("checkPremiumRichness — IV proxy / thin-premium guard", () => {
  it("blocks premium below the min percent of notional", async () => {
    // default min_premium_pct = 0.005; notional = strike*100 = 10000
    // premium 10 → 0.001 < 0.005 → blocked
    const r = await checkPremiumRichness(10, 100);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/too thin/i);
  });

  it("allows premium at or above the min percent", async () => {
    // premium 60 on notional 10000 = 0.006 >= 0.005 → allowed
    const r = await checkPremiumRichness(60, 100);
    expect(r.allowed).toBe(true);
  });
});

describe("checkCallPremium — minimum covered-call premium", () => {
  it("blocks below the minimum", async () => {
    // default min_call_premium = 20
    const r = await checkCallPremium(10);
    expect(r.allowed).toBe(false);
  });

  it("allows at or above the minimum", async () => {
    const r = await checkCallPremium(25);
    expect(r.allowed).toBe(true);
  });
});
