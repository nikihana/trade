import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getAccount, getAccountActivities, type AlpacaActivity } from "@/lib/alpaca";
import { requireAdmin } from "@/lib/admin-guard";

const STARTING_CASH = 100_000; // Alpaca paper account default seed

interface ParsedActivity {
  id: string;
  type: string;
  date: string;
  symbol: string;
  side: string;
  price: number | null;
  qty: number | null;
  cashEffect: number; // signed: positive = cash in, negative = cash out
  description: string;
  matchedContract: string | null;
  notes: string;
}

/**
 * Parse one Alpaca activity into a normalized cash-effect row.
 * Returns null for activities that don't affect cash.
 */
function parseActivity(a: AlpacaActivity, contractsBySymbol: Map<string, { id: string; premium: number; closePrice: number | null }[]>): ParsedActivity {
  const t = a.activity_type;
  const date = a.transaction_time || a.date || "";
  const symbol = a.symbol || "";

  if (t === "FILL") {
    const price = a.price ? parseFloat(a.price) : 0;
    const qty = a.qty ? parseFloat(a.qty) : 0;
    const side = a.side || "";
    // Options: price is per-share, qty is contracts, multiplier is 100
    // Stocks (assignment / call-away): price is per-share, qty is shares, no multiplier
    const isOption = /^[A-Z]+\d{6}[PC]\d{8}$/.test(symbol);
    const multiplier = isOption ? 100 : 1;
    const gross = price * qty * multiplier;
    const cashEffect = side === "sell" ? gross : -gross;

    const dbMatch = contractsBySymbol.get(symbol) ?? [];
    const matchedContract = dbMatch.length > 0 ? dbMatch[0].id : null;
    let notes = "";
    if (!matchedContract && isOption) notes = "NO DB MATCH (suspect)";

    return {
      id: a.id,
      type: `FILL ${side}`,
      date,
      symbol,
      side,
      price,
      qty,
      cashEffect,
      description: `${side === "sell" ? "+" : "-"}${(price * multiplier).toFixed(2)} × ${qty}`,
      matchedContract,
      notes,
    };
  }

  // Non-trade: rely on net_amount
  const net = a.net_amount ? parseFloat(a.net_amount) : 0;
  return {
    id: a.id,
    type: t,
    date,
    symbol: "",
    side: "",
    price: null,
    qty: null,
    cashEffect: net,
    description: a.description || "",
    matchedContract: null,
    notes: "",
  };
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const [account, activities, contracts, allCycles, activeCycles] = await Promise.all([
      getAccount(),
      getAccountActivities(),
      sql`SELECT id, symbol, premium, "closePrice" FROM "Contract" ORDER BY "openedAt" ASC`,
      sql`SELECT "realizedPL" FROM "WheelCycle"`,
      sql`SELECT "totalPremium" FROM "WheelCycle" WHERE "completedAt" IS NULL`,
    ]);

    // Index DB contracts by symbol for matching
    const contractsBySymbol = new Map<string, { id: string; premium: number; closePrice: number | null }[]>();
    for (const c of contracts) {
      const sym = String(c.symbol);
      const list = contractsBySymbol.get(sym) ?? [];
      list.push({
        id: String(c.id),
        premium: Number(c.premium),
        closePrice: c.closePrice !== null ? Number(c.closePrice) : null,
      });
      contractsBySymbol.set(sym, list);
    }

    // Sort activities by date ascending so the table reads chronologically
    activities.sort((a, b) => {
      const da = a.transaction_time || a.date || "";
      const db = b.transaction_time || b.date || "";
      return da.localeCompare(db);
    });

    const parsed = activities.map((a) => parseActivity(a, contractsBySymbol));

    // Alpaca-side trajectory
    const alpacaCurrentCash = account.cash;
    const alpacaNetChange = parsed.reduce((s, p) => s + p.cashEffect, 0);
    const alpacaStartingCash = alpacaCurrentCash - alpacaNetChange;

    // DB-side expected
    const dbRealizedPL = allCycles.reduce((s, c) => s + Number(c.realizedPL || 0), 0);
    const dbPremiumOpen = activeCycles.reduce((s, c) => s + Number(c.totalPremium || 0), 0);
    const dbExpectedCash = STARTING_CASH + dbRealizedPL + dbPremiumOpen;

    const gap = alpacaCurrentCash - dbExpectedCash;

    // Categorize the gap
    let feeTotal = 0;
    let interestTotal = 0;
    let dividendTotal = 0;
    let untrackedFillTotal = 0;
    let otherTotal = 0;
    const untrackedFills: ParsedActivity[] = [];
    for (const p of parsed) {
      if (p.type === "FEE") feeTotal += p.cashEffect;
      else if (p.type === "INT") interestTotal += p.cashEffect;
      else if (p.type === "DIV" || p.type === "DIVCGL") dividendTotal += p.cashEffect;
      else if (p.type.startsWith("FILL") && p.notes.startsWith("NO DB MATCH")) {
        untrackedFillTotal += p.cashEffect;
        untrackedFills.push(p);
      } else if (!p.type.startsWith("FILL") && p.type !== "CSD" && p.type !== "CSW") {
        otherTotal += p.cashEffect;
      }
    }

    // Tracked fills sum (for sanity — should approximate dbRealizedPL + dbPremiumOpen)
    const trackedFillTotal = parsed
      .filter((p) => p.type.startsWith("FILL") && !p.notes.startsWith("NO DB MATCH"))
      .reduce((s, p) => s + p.cashEffect, 0);

    const md = renderReport({
      alpacaStartingCash,
      alpacaCurrentCash,
      alpacaNetChange,
      dbStartingCash: STARTING_CASH,
      dbRealizedPL,
      dbPremiumOpen,
      dbExpectedCash,
      gap,
      activities: parsed,
      feeTotal,
      interestTotal,
      dividendTotal,
      untrackedFillTotal,
      untrackedFills,
      otherTotal,
      trackedFillTotal,
    });

    return new NextResponse(md, { headers: { "content-type": "text/markdown" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function shortId(id: string): string {
  return id.length > 10 ? id.slice(0, 10) : id;
}

function renderReport(d: {
  alpacaStartingCash: number;
  alpacaCurrentCash: number;
  alpacaNetChange: number;
  dbStartingCash: number;
  dbRealizedPL: number;
  dbPremiumOpen: number;
  dbExpectedCash: number;
  gap: number;
  activities: ParsedActivity[];
  feeTotal: number;
  interestTotal: number;
  dividendTotal: number;
  untrackedFillTotal: number;
  untrackedFills: ParsedActivity[];
  otherTotal: number;
  trackedFillTotal: number;
}): string {
  const lines: string[] = [];
  lines.push(`## Account reconciliation`);
  lines.push(``);
  lines.push("```");
  lines.push(`Alpaca starting cash:     ${fmt(d.alpacaStartingCash)}`);
  lines.push(`Alpaca current cash:      ${fmt(d.alpacaCurrentCash)}`);
  lines.push(`Alpaca net change:        ${fmt(d.alpacaNetChange)}`);
  lines.push(``);
  lines.push(`DB starting cash:         ${fmt(d.dbStartingCash)}`);
  lines.push(`DB realized P&L:          ${fmt(d.dbRealizedPL)}`);
  lines.push(`DB premium (open cycles): ${fmt(d.dbPremiumOpen)}`);
  lines.push(`DB expected cash:         ${fmt(d.dbExpectedCash)}`);
  lines.push(``);
  lines.push(`Gap (Alpaca − DB):        ${fmt(d.gap)}`);
  lines.push("```");
  lines.push(``);

  if (d.activities.length === 0) {
    lines.push(`*No account activities returned by Alpaca.*`);
    lines.push(``);
  } else {
    lines.push(`## Activity-by-activity reconciliation`);
    lines.push(``);
    lines.push(`| Date | Type | Symbol | Cash effect | DB match | Notes |`);
    lines.push(`|------|------|--------|------------:|----------|-------|`);
    for (const a of d.activities) {
      const dateShort = a.date ? a.date.slice(0, 10) : "—";
      const symShort = a.symbol || "—";
      const matchCol = a.matchedContract
        ? `matched ${shortId(a.matchedContract)}`
        : a.type.startsWith("FILL")
          ? a.notes || "—"
          : "n/a";
      lines.push(
        `| ${dateShort} | ${a.type} | ${symShort} | ${fmt(a.cashEffect)} | ${matchCol} | ${a.notes || a.description || ""} |`
      );
    }
    lines.push(``);
  }

  lines.push(`## Gap breakdown`);
  lines.push(``);
  lines.push("```");
  lines.push(`Tracked fills (matched):  ${fmt(d.trackedFillTotal)}`);
  lines.push(`Fees / commissions:       ${fmt(d.feeTotal)}`);
  lines.push(`Interest credits:         ${fmt(d.interestTotal)}`);
  lines.push(`Dividends:                ${fmt(d.dividendTotal)}`);
  lines.push(`Untracked fills:          ${fmt(d.untrackedFillTotal)}  ${d.untrackedFillTotal !== 0 ? "(suspect — investigate each)" : ""}`);
  lines.push(`Other:                    ${fmt(d.otherTotal)}`);
  const accounted = d.trackedFillTotal + d.feeTotal + d.interestTotal + d.dividendTotal + d.untrackedFillTotal + d.otherTotal;
  lines.push(``);
  lines.push(`Total Alpaca net change:  ${fmt(d.alpacaNetChange)}`);
  lines.push(`Sum of categories:        ${fmt(accounted)}`);
  lines.push(`Categorization residual:  ${fmt(d.alpacaNetChange - accounted)}  ${Math.abs(d.alpacaNetChange - accounted) < 0.01 ? "✓" : "(unexplained — fix categorization)"}`);
  lines.push("```");
  lines.push(``);

  if (d.untrackedFills.length > 0) {
    lines.push(`## Suspect untracked fills`);
    lines.push(``);
    lines.push(`Each row below is a FILL on Alpaca with no matching Contract row in the DB.`);
    lines.push(`These are real bugs — investigate each one before flipping the verification flag.`);
    lines.push(``);
    lines.push(`| Date | Symbol | Side | Qty | Price | Cash effect |`);
    lines.push(`|------|--------|------|----:|------:|------------:|`);
    for (const u of d.untrackedFills) {
      lines.push(
        `| ${(u.date || "").slice(0, 10)} | ${u.symbol} | ${u.side} | ${u.qty ?? ""} | ${u.price ?? ""} | ${fmt(u.cashEffect)} |`
      );
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`Generated ${new Date().toISOString()}. No corrections were applied.`);
  return lines.join("\n");
}
