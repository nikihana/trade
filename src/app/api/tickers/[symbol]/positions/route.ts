import { NextResponse } from "next/server";
import { getPositions, getOrders, getAccount } from "@/lib/alpaca";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upper = symbol.toUpperCase();

    const [positions, orders, account] = await Promise.all([
      getPositions(),
      getOrders("all", 20),
      getAccount(),
    ]);

    // Filter positions for this ticker (stock + options)
    const tickerPositions = positions.filter(
      (p) => p.symbol === upper || p.symbol.startsWith(upper)
    );

    // Filter orders for this ticker
    const tickerOrders = (orders as Record<string, unknown>[])
      .filter((o) => {
        const sym = String(o.symbol || "");
        return sym === upper || sym.startsWith(upper);
      })
      .map((o) => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        qty: o.qty,
        filledQty: o.filled_qty,
        filledAvgPrice: o.filled_avg_price,
        status: o.status,
        createdAt: o.created_at,
        filledAt: o.filled_at,
        assetClass: o.asset_class,
      }));

    return NextResponse.json({
      symbol: upper,
      account: {
        cash: account.cash,
        buyingPower: account.buyingPower,
        equity: account.equity,
      },
      positions: tickerPositions,
      orders: tickerOrders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
