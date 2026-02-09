import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getIssuePRs, unlinkPR } from "@/lib/services/issuePRService";

/**
 * GET /api/issues/[id]/pr
 * Get all PRs linked to an issue
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const prs = await getIssuePRs(id);
    return NextResponse.json(prs);
  } catch (error) {
    console.error("Error fetching issue PRs:", error);
    return NextResponse.json({ error: "Failed to fetch PRs" }, { status: 500 });
  }
}

/**
 * DELETE /api/issues/[id]/pr
 * Unlink a PR from an issue
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { prId } = body;

    if (!prId) {
      return NextResponse.json({ error: "prId required" }, { status: 400 });
    }

    const success = await unlinkPR(prId, "user", "Manual unlink");

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("Error unlinking PR:", error);
    return NextResponse.json({ error: "Failed to unlink PR" }, { status: 500 });
  }
}
