import { describe, it, expect } from "vitest";
import { realizedPLContribution, parseStrikeFromOCC } from "./pnl";

describe("realizedPLContribution — the audit formula / money-adjacent core", () => {
  // The contributing path: MANUAL / STOP_LOSS / PROFIT_TARGET closes
  it("MANUAL close contributes premium - closePrice", () => {
    expect(realizedPLContribution("CLOSED", "MANUAL", 145, 177)).toBe(-32);
    expect(realizedPLContribution("CLOSED", "MANUAL", 142, 234)).toBe(-92);
  });

  it("STOP_LOSS close contributes premium - closePrice (reconciler doesn't filter reason)", () => {
    expect(realizedPLContribution("CLOSED", "STOP_LOSS", 300, 450)).toBe(-150);
  });

  it("PROFIT_TARGET close contributes premium - closePrice", () => {
    expect(realizedPLContribution("CLOSED", "PROFIT_TARGET", 200, 100)).toBe(100);
  });

  it("treats null closePrice as 0 (premium fully realized)", () => {
    expect(realizedPLContribution("CLOSED", "MANUAL", 120, null)).toBe(120);
  });

  // The zero-contribution paths — these must NOT inflate realized P&L
  it("CANCELLED (order never filled) contributes 0 — the AMD phantom case", () => {
    expect(realizedPLContribution("CLOSED", "CANCELLED", 312, 0)).toBe(0);
  });

  it("EXPIRED worthless contributes 0 (production sweep doesn't touch realizedPL)", () => {
    expect(realizedPLContribution("EXPIRED", "EXPIRATION", 90, 0)).toBe(0);
  });

  it("ASSIGNED contributes 0 (handled at cycle level via call-away)", () => {
    expect(realizedPLContribution("ASSIGNED", "ASSIGNMENT", 90, null)).toBe(0);
  });

  it("unknown / unexpected status+reason contributes 0 (never guesses)", () => {
    expect(realizedPLContribution("PENDING", null, 100, null)).toBe(0);
    expect(realizedPLContribution("CLOSED", "FAILED_CLOSE", 100, 50)).toBe(0);
    expect(realizedPLContribution("OPEN", null, 100, null)).toBe(0);
  });

  it("regression: sum of the two corrected historical contracts equals -124", () => {
    const orcl = realizedPLContribution("CLOSED", "MANUAL", 145, 177);
    const crm = realizedPLContribution("CLOSED", "MANUAL", 142, 234);
    expect(orcl + crm).toBe(-124);
  });
});

describe("parseStrikeFromOCC — deployed-capital math", () => {
  it("parses standard OCC put symbols", () => {
    expect(parseStrikeFromOCC("AMD260424P00210000")).toBe(210);
    expect(parseStrikeFromOCC("ORCL260424P00130000")).toBe(130);
    expect(parseStrikeFromOCC("CRM260424P00162500")).toBe(162.5);
  });

  it("parses call symbols", () => {
    expect(parseStrikeFromOCC("QQQ260605C00500000")).toBe(500);
  });

  it("returns 0 for non-OCC / malformed symbols (no false deployed capital)", () => {
    expect(parseStrikeFromOCC("AAPL")).toBe(0);
    expect(parseStrikeFromOCC("")).toBe(0);
    expect(parseStrikeFromOCC("not a symbol")).toBe(0);
  });
});
