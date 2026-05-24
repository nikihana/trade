import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getOrders } from "@/lib/alpaca";
import { requireAdmin } from "@/lib/admin-guard";
import { realizedPLContribution } from "@/lib/pnl";

interface SuspectRow {
  id: string;
  symbol: string;
  cycleId: string;
  status: string;
  closePrice: number | null;
  closedReason: string | null;
  closedAt: string | null;
  alpacaOrderId: string | null;
  premium: number;
  type: string;
}

interface AlpacaOrder {
  id: string;
  symbol: string;
  side: string;
  status: string;
  filled_qty?: string;
  filled_avg_price?: string | null;
  submitted_at?: string;
  canceled_at?: string;
  expired_at?: string;
}

interface Finding {
  contractId: string;
  symbol: string;
  cycleId: string;
  dbStatus: string;
  dbClosedReason: string | null;
  dbClosePrice: number | null;
  alpacaCloseStatus: string;
  alpacaFilledPrice: number | null;
  premium: number;
  currentRealizedContribution: number;
  correctedRealizedContribution: number;
  delta: number;
  suggestion: string;
  sql: string | null;
}

interface FormulaGapRow {
  contractId: string;
  symbol: string;
  cycleId: string;
  closedReason: string;
  premium: number;
  closePrice: number | null;
}

/**
 * GET /api/admin/audit-pnl
 * Read-only. Audits Contract rows for close-path corruption from prior silent-zero quotes.
 * Reconciles each suspect against Alpaca's actual fill state. Returns Markdown report.
 * Does NOT auto-correct anything.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    // Suspect rows: CLOSED via the realizedPL-contributing path (MANUAL,
    // STOP_LOSS, PROFIT_TARGET) with $0/NULL closePrice (the actual corruption
    // shape) OR half-written PENDING_CLOSE OR FAILED_CLOSE.
    // CANCELLED/EXPIRATION rows with closePrice=0 are NOT suspect — production
    // intentionally writes 0 there and never touches realizedPL.
    const suspectRows = await sql`
      SELECT id, symbol, "cycleId", status,
             "closePrice", "closedReason", "closedAt",
             "alpacaOrderId", premium, type
      FROM "Contract"
      WHERE
        (status = 'CLOSED'
          AND "closedReason" IN ('MANUAL', 'STOP_LOSS', 'PROFIT_TARGET')
          AND ("closePrice" = 0 OR "closePrice" IS NULL))
        OR (status = 'PENDING_CLOSE' AND "closedAt" IS NOT NULL)
        OR ("closedReason" = 'FAILED_CLOSE')
      ORDER BY "closedAt" DESC NULLS LAST
    `;

    // Production formula gaps: previously tracked STOP_LOSS / PROFIT_TARGET
    // not propagating to realizedPL. That gap was closed (tick-engine.ts now
    // marks them PENDING_CLOSE and the reconciler handles realizedPL). No
    // currently known gaps remain. Section retained as a stub so future gaps
    // have a documented home.
    const gapRows: FormulaGapRow[] = [];

    const totalContracts = (await sql`SELECT COUNT(*) AS c FROM "Contract"`)[0].c;

    if (suspectRows.length === 0) {
      // Even with no suspects, sum cycles + emit gap section so the report
      // is complete and the deferred bug stays visible.
      const cycles = await sql`SELECT id, "realizedPL" FROM "WheelCycle"`;
      const currentRealizedPL = cycles.reduce(
        (s, c) => s + Number(c.realizedPL || 0),
        0
      );
      const md = renderReport(
        Number(totalContracts),
        [],
        0,
        currentRealizedPL,
        currentRealizedPL,
        0,
        gapRows
      );
      return new NextResponse(md, { headers: { "content-type": "text/markdown" } });
    }

    // Pull a generous slice of orders from Alpaca; group by symbol for lookup
    const allOrders = (await getOrders("all", 500)) as unknown as AlpacaOrder[];
    const ordersBySymbol = new Map<string, AlpacaOrder[]>();
    for (const o of allOrders) {
      if (!o.symbol) continue;
      const list = ordersBySymbol.get(o.symbol) ?? [];
      list.push(o);
      ordersBySymbol.set(o.symbol, list);
    }

    const findings: Finding[] = [];

    for (const r of suspectRows) {
      const row: SuspectRow = {
        id: String(r.id),
        symbol: String(r.symbol),
        cycleId: String(r.cycleId),
        status: String(r.status),
        closePrice: r.closePrice !== null ? Number(r.closePrice) : null,
        closedReason: r.closedReason ? String(r.closedReason) : null,
        closedAt: r.closedAt ? String(r.closedAt) : null,
        alpacaOrderId: r.alpacaOrderId ? String(r.alpacaOrderId) : null,
        premium: Number(r.premium),
        type: String(r.type),
      };

      // Find the most recent BUY order for this contract symbol — that's the close
      const symOrders = ordersBySymbol.get(row.symbol) ?? [];
      const buyOrders = symOrders.filter((o) => o.side === "buy");
      const latestBuy = buyOrders.sort(
        (a, b) =>
          new Date(b.submitted_at ?? 0).getTime() -
          new Date(a.submitted_at ?? 0).getTime()
      )[0];

      let alpacaCloseStatus = "no_close_order_found";
      let alpacaFilledPrice: number | null = null;

      if (latestBuy) {
        alpacaCloseStatus = latestBuy.status;
        if (latestBuy.status === "filled" && latestBuy.filled_avg_price) {
          alpacaFilledPrice = Number(latestBuy.filled_avg_price);
        }
      }

      // closePrice in DB is stored as dollars-per-contract (= midPrice * 100).
      // Alpaca filled_avg_price is per-share — multiply by 100 to compare.
      const correctedClosePrice =
        alpacaFilledPrice !== null ? alpacaFilledPrice * 100 : null;

      // Contribution to realizedPL — uses the production formula from
      // realizedPLContribution(). For non-MANUAL rows this is always 0,
      // even if closePrice is non-zero, because production never propagates
      // those to realizedPL.
      const currentContrib = realizedPLContribution(
        row.status,
        row.closedReason,
        row.premium,
        row.closePrice
      );
      // Corrected contribution: same formula, but assume the close price would
      // be the Alpaca-confirmed fill if MANUAL, else 0.
      const correctedContrib =
        row.closedReason === "MANUAL" && correctedClosePrice !== null
          ? row.premium - correctedClosePrice
          : 0;

      let suggestion: string;
      let sqlFix: string | null = null;

      if (alpacaCloseStatus === "filled" && correctedClosePrice !== null) {
        if (row.closePrice !== correctedClosePrice) {
          suggestion = `UPDATE closePrice from ${fmtP(row.closePrice)} → $${correctedClosePrice.toFixed(2)}`;
          sqlFix = `UPDATE "Contract" SET "closePrice" = ${correctedClosePrice.toFixed(2)} WHERE id = '${row.id}';`;
        } else {
          suggestion = `OK — DB closePrice matches Alpaca fill`;
        }
      } else if (
        alpacaCloseStatus === "canceled" ||
        alpacaCloseStatus === "expired" ||
        alpacaCloseStatus === "rejected"
      ) {
        if (row.status === "CLOSED" || row.status === "PENDING_CLOSE") {
          suggestion = `REVERT to OPEN — close ${alpacaCloseStatus} on Alpaca, contract was wrongly marked ${row.status}`;
          sqlFix = `UPDATE "Contract" SET status = 'OPEN', "closedAt" = NULL, "closePrice" = NULL, "closedReason" = NULL WHERE id = '${row.id}';`;
        } else {
          suggestion = `Status ${row.status} consistent with Alpaca ${alpacaCloseStatus}`;
        }
      } else if (alpacaCloseStatus === "no_close_order_found") {
        if (row.status === "CLOSED") {
          suggestion = `MANUAL REVIEW — DB says CLOSED but no close order on Alpaca`;
        } else if (row.closedReason === "FAILED_CLOSE") {
          suggestion = `Re-attempt close manually during market hours`;
        } else {
          suggestion = `MANUAL REVIEW — Alpaca order history may have been pruned`;
        }
      } else {
        suggestion = `Alpaca status: ${alpacaCloseStatus} — review`;
      }

      findings.push({
        contractId: row.id,
        symbol: row.symbol,
        cycleId: row.cycleId,
        dbStatus: row.status,
        dbClosedReason: row.closedReason,
        dbClosePrice: row.closePrice,
        alpacaCloseStatus,
        alpacaFilledPrice,
        premium: row.premium,
        currentRealizedContribution: currentContrib,
        correctedRealizedContribution: correctedContrib,
        delta: correctedContrib - currentContrib,
        suggestion,
        sql: sqlFix,
      });
    }

    // Compute current vs corrected realized P&L from cycle data
    const cycles = await sql`SELECT id, "realizedPL" FROM "WheelCycle"`;
    const currentRealizedPL = cycles.reduce(
      (s, c) => s + Number(c.realizedPL || 0),
      0
    );
    const totalDelta = findings.reduce((s, f) => s + f.delta, 0);
    const correctedRealizedPL = currentRealizedPL + totalDelta;

    const confirmedCorruption = findings.filter((f) => f.sql !== null).length;
    const md = renderReport(
      Number(totalContracts),
      findings,
      confirmedCorruption,
      currentRealizedPL,
      correctedRealizedPL,
      totalDelta,
      gapRows
    );

    return new NextResponse(md, { headers: { "content-type": "text/markdown" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function fmtP(n: number | null): string {
  if (n === null) return "NULL";
  return `$${n.toFixed(2)}`;
}

function renderReport(
  total: number,
  findings: Finding[],
  confirmedCorruption: number,
  currentPL: number,
  correctedPL: number,
  delta: number,
  formulaGapRows: FormulaGapRow[]
): string {
  const lines: string[] = [];
  lines.push(`## Audit findings`);
  lines.push(``);
  lines.push(`Total contracts inspected: ${total}`);
  lines.push(`Contracts with suspicious state: ${findings.length}`);
  lines.push(`Contracts with confirmed corruption (Alpaca disagrees with DB): ${confirmedCorruption}`);
  lines.push(``);

  if (findings.length > 0) {
    lines.push(`### Detailed findings`);
    lines.push(``);
    lines.push(
      `| Contract ID | Symbol | DB status | DB closedReason | DB closePrice | Alpaca status | Alpaca filled price | Suggestion |`
    );
    lines.push(
      `|-------------|--------|-----------|-----------------|---------------|---------------|---------------------|------------|`
    );
    for (const f of findings) {
      lines.push(
        `| ${shortId(f.contractId)} | ${f.symbol} | ${f.dbStatus} | ${f.dbClosedReason ?? "NULL"} | ${fmtP(f.dbClosePrice)} | ${f.alpacaCloseStatus} | ${fmtP(f.alpacaFilledPrice !== null ? f.alpacaFilledPrice * 100 : null)} | ${f.suggestion} |`
      );
    }
    lines.push(``);
  } else {
    lines.push(`**No suspect rows found.** Nothing to reconcile.`);
    lines.push(``);
  }

  lines.push(`### P&L impact`);
  lines.push(``);
  lines.push(`Current dashboard Realized P&L: $${currentPL.toFixed(2)}`);
  lines.push(`Corrected Realized P&L (computed): $${correctedPL.toFixed(2)}`);
  lines.push(`Delta: $${delta.toFixed(2)}`);
  lines.push(``);

  const fixes = findings.filter((f) => f.sql !== null);
  lines.push(`### Recommended SQL corrections (for user review — do not execute)`);
  lines.push(``);
  if (fixes.length > 0) {
    lines.push("```sql");
    for (const f of fixes) lines.push(f.sql!);
    lines.push("```");
  } else {
    lines.push(`None — no actionable corruption found.`);
  }
  lines.push(``);

  // Production-gap section — surfaces deferred bugs every time the audit runs
  lines.push(`### Production formula gaps`);
  lines.push(``);
  if (formulaGapRows.length === 0) {
    lines.push(`No known production formula gaps.`);
  } else {
    lines.push(`**Exercised rows:** ${formulaGapRows.length}`);
    lines.push(``);
    lines.push(`| Contract ID | Symbol | closedReason | premium | closePrice |`);
    lines.push(`|-------------|--------|--------------|---------|------------|`);
    for (const g of formulaGapRows) {
      lines.push(
        `| ${shortId(g.contractId)} | ${g.symbol} | ${g.closedReason} | ${fmtP(g.premium)} | ${fmtP(g.closePrice)} |`
      );
    }
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(`Generated ${new Date().toISOString()}. No corrections were applied.`);
  return lines.join("\n");
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
