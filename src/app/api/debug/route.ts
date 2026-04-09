import { NextResponse } from "next/server";
import { getAccount, getPositions, getOrders } from "@/lib/alpaca";

/**
 * GET /api/debug — Full Alpaca account diagnostic
 * Shows exactly what Alpaca sees: account details, all positions, all open orders
 */
export async function GET() {
  try {
    const [account, positions, openOrders, recentOrders] = await Promise.all([
      // Raw account data from Alpaca
      fetch(`${process.env.ALPACA_BASE_URL}/v2/account`, {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY || "",
        },
      }).then((r) => r.json()),
      getPositions(),
      getOrders("open", 50),
      getOrders("all", 10),
    ]);

    // Calculate what's eating buying power
    const shortPuts = positions.filter((p) => p.qty < 0);
    const longPositions = positions.filter((p) => p.qty > 0);

    const collateralFromPuts = shortPuts.reduce((sum, p) => {
      // For short puts, collateral = strike × 100 × abs(qty)
      // The symbol contains the strike info but we'll use market value as proxy
      return sum + Math.abs(p.marketValue);
    }, 0);

    const pendingOrderValue = (openOrders as Record<string, unknown>[]).reduce((sum, o) => {
      // Approximate collateral reserved by pending orders
      const sym = String(o.symbol || "");
      // Extract strike from OCC symbol: AMD260424P00210000 → 210
      const match = sym.match(/(\d{8})$/);
      if (match) {
        const strike = parseInt(match[1]) / 1000;
        return sum + strike * 100;
      }
      return sum;
    }, 0);

    return NextResponse.json({
      account: {
        cash: account.cash,
        equity: account.equity,
        buying_power: account.buying_power,
        options_buying_power: account.options_buying_power,
        maintenance_margin: account.maintenance_margin,
        initial_margin: account.initial_margin,
        portfolio_value: account.portfolio_value,
        non_marginable_buying_power: account.non_marginable_buying_power,
        regt_buying_power: account.regt_buying_power,
        sma: account.sma,
        daytrade_count: account.daytrade_count,
        accrued_fees: account.accrued_fees,
        pending_transfer_in: account.pending_transfer_in,
        pending_transfer_out: account.pending_transfer_out,
      },
      positions: positions.map((p) => ({
        symbol: p.symbol,
        qty: p.qty,
        avgEntryPrice: p.avgEntryPrice,
        currentPrice: p.currentPrice,
        marketValue: p.marketValue,
        unrealizedPL: p.unrealizedPL,
      })),
      openOrders: (openOrders as Record<string, unknown>[]).map((o) => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        qty: o.qty,
        filled_qty: o.filled_qty,
        status: o.status,
        limit_price: o.limit_price,
        created_at: o.created_at,
      })),
      recentOrders: (recentOrders as Record<string, unknown>[]).map((o) => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        qty: o.qty,
        filled_qty: o.filled_qty,
        filled_avg_price: o.filled_avg_price,
        status: o.status,
        created_at: o.created_at,
      })),
      analysis: {
        shortPutCount: shortPuts.length,
        longPositionCount: longPositions.length,
        openOrderCount: (openOrders as unknown[]).length,
        estimatedCollateralFromPuts: collateralFromPuts,
        estimatedPendingOrderCollateral: pendingOrderValue,
        buyingPowerFormula: `options_buying_power = cash (${account.cash}) - collateral_for_open_short_puts - collateral_for_pending_orders`,
        gap: `${account.cash} - ${account.options_buying_power} = ${(parseFloat(account.cash) - parseFloat(account.options_buying_power)).toFixed(2)} locked up`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
