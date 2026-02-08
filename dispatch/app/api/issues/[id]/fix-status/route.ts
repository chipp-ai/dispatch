import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getIssue } from "@/lib/services/issueService";
import {
  getFixAttemptsForIssue,
  checkFixVerification,
  canMoveToCloseStatus,
  getFixAttemptStatusDisplay,
} from "@/lib/services/fixTrackingService";
import { getExternalLinksForIssue } from "@/lib/services/externalIssueService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/issues/[id]/fix-status
 * Returns fix tracking status for an issue including:
 * - Whether the issue has Sentry links
 * - All fix attempts and their verification status
 * - Whether the issue can be closed
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Check if issue exists
    const issue = await getIssue(id);
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Get external links to check for Sentry
    const externalLinks = await getExternalLinksForIssue(id);
    const sentryLinks = externalLinks.filter(
      (link) => link.source === "sentry"
    );
    const hasSentryLink = sentryLinks.length > 0;

    // Trigger lazy verification check
    await checkFixVerification(id);

    // Get all fix attempts
    const fixAttempts = await getFixAttemptsForIssue(id);

    // Get closing eligibility
    const closeEligibility = await canMoveToCloseStatus(id);

    // Get display status for latest fix attempt
    const latestFixAttempt = fixAttempts.length > 0 ? fixAttempts[0] : null;
    const displayStatus = getFixAttemptStatusDisplay(latestFixAttempt);

    return NextResponse.json({
      issueId: id,
      identifier: issue.identifier,
      hasSentryLink,
      sentryLinks: sentryLinks.map((link) => ({
        id: link.id,
        externalId: link.external_id,
        url: link.external_url,
        metadata: link.metadata,
      })),
      fixAttempts: fixAttempts.map((fa) => ({
        id: fa.id,
        prNumber: fa.pr_number,
        prUrl: fa.pr_url,
        prTitle: fa.pr_title,
        mergedAt: fa.merged_at,
        mergedSha: fa.merged_sha,
        deployedAt: fa.deployed_at,
        deployedSha: fa.deployed_sha,
        verificationStatus: fa.verification_status,
        verificationDeadline: fa.verification_deadline,
        failureReason: fa.failure_reason,
        sentryEventsPostDeploy: fa.sentry_events_post_deploy,
      })),
      latestFixStatus: displayStatus,
      canClose: closeEligibility.allowed,
      closeBlockReason: closeEligibility.reason || null,
    });
  } catch (error) {
    console.error("Error getting fix status:", error);
    return NextResponse.json(
      { error: "Failed to get fix status" },
      { status: 500 }
    );
  }
}
