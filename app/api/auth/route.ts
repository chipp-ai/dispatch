import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSession,
  clearSession,
  getSession,
} from "@/lib/utils/auth";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const isValid = await verifyPassword(password);

    if (!isValid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    await createSession();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await getSession();

  return NextResponse.json({
    authenticated: session !== null,
  });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ success: true });
}
