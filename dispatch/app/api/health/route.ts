import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "chipp-issues",
    timestamp: new Date().toISOString(),
  });
}
