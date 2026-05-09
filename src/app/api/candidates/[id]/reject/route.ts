import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;

    const rows = await sql`SELECT id, status, symbol FROM "Candidate" WHERE id = ${id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (rows[0].status !== "proposed") {
      return NextResponse.json(
        { error: `Candidate is already ${rows[0].status}` },
        { status: 400 }
      );
    }

    await sql`UPDATE "Candidate" SET status = 'rejected' WHERE id = ${id}`;

    return NextResponse.json({ success: true, symbol: rows[0].symbol });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
