import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";

/**
 * POST /api/auth/setup — Set password for admin user (first-time setup only)
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (user.hashedPassword) {
      return NextResponse.json(
        { error: "Password already set. Use login instead." },
        { status: 400 }
      );
    }

    const hashedPassword = await hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/setup — Check if setup is needed
 */
export async function GET() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: "nikihana@gmail.com" },
    });

    return NextResponse.json({
      needsSetup: !user || !user.hashedPassword,
      userExists: !!user,
    });
  } catch {
    return NextResponse.json({ needsSetup: true, userExists: false });
  }
}
