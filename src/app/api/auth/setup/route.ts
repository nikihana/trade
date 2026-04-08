import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { sql } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const rows = await sql`SELECT id, "hashedPassword" FROM "User" WHERE email = ${email}`;
    const user = rows[0];

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (user.hashedPassword) {
      return NextResponse.json({ error: "Password already set. Use login instead." }, { status: 400 });
    }

    const hashedPassword = await hash(password, 12);
    await sql`UPDATE "User" SET "hashedPassword" = ${hashedPassword} WHERE id = ${user.id}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = await sql`SELECT id, "hashedPassword" FROM "User" WHERE email = 'nikihana@gmail.com'`;
    const user = rows[0];
    return NextResponse.json({ needsSetup: !user || !user.hashedPassword, userExists: !!user });
  } catch {
    return NextResponse.json({ needsSetup: true, userExists: false });
  }
}
