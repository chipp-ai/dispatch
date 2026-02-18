"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import IssueHeader from "@/components/IssueHeader";
import UnifiedTimeline from "@/components/UnifiedTimeline";
import RetrySpawnDialog from "@/components/RetrySpawnDialog";
import { mergeTimeline } from "@/lib/timeline/mergeTimeline";
import type {
  Issue,
  LinkedPR,
  AgentActivity,
  HistoryEntry,
} from "@/lib/timeline/types";
import type { AgentRunSummary } from "@/components/RunCard";

export default function IssuePageClient({
  isModal = false,
  onClose,
}: {
  isModal?: boolean;
  onClose?: () => void;
} = {}) {
  const router = useRouter();
  const params = useParams();
  const identifier = params.identifier as string;

  // --- Core state ---
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");

  // Data streams
  const [linkedPRs, setLinkedPRs] = useState<LinkedPR[]>([]);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunSummary[]>([]);
  const [issueHistory, setIssueHistory] = useState<HistoryEntry[]>([]);

  // Plan review
  const [planRejectFeedback, setPlanRejectFeedback] = useState("");
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [autoSpawnOnApprove, setAutoSpawnOnApprove] = useState(true);
  const [showRejectForm, setShowRejectForm] = useState(false);

  // Actions
  const [spawnLoading, setSpawnLoading] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showRetryDialog, setShowRetryDialog] = useState(false);

  const issueJsonRef = useRef<string>("");
  const prevAgentStatusRef = useRef<string | null>(null);

  // --- Fetch functions ---

  const fetchIssue = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${identifier}`);
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Issue not found");
          return;
        }
        throw new Error("Failed to fetch issue");
      }
      const data = await res.json();
      const json = JSON.stringify(data);
      if (json !== issueJsonRef.current) {
        issueJsonRef.current = json;
        setIssue(data);
        setTitleValue(data.title);
        setDescriptionValue(data.description || "");
      }
    } catch {
      setError("Failed to load issue");
    }
  }, [identifier, router]);

  const fetchAgentActivity = useCallback(async () => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/activity`);
      if (res.ok) {
        const data = await res.json();
        setAgentActivities(data);

        // Load persisted log into terminal when no live lines exist
        if (terminalLines.length === 0) {
          const isActive =
            issue.agent_status === "investigating" ||
            issue.agent_status === "implementing";

          if (isActive) {
            try {
              const runRes = await fetch(
                `/api/issues/${issue.id}/runs/current`
              );
              if (runRes.ok) {
                const runData = await runRes.json();
                if (runData.transcript) {
                  setTerminalLines(runData.transcript.split("\n"));
                }
              }
            } catch {
              // Non-fatal
            }
          } else {
            const fullLog = [...data]
              .reverse()
              .find((a: AgentActivity) => a.type === "agent_full_log");
            if (fullLog?.content) {
              setTerminalLines(fullLog.content.split("\n"));
            } else {
              try {
                const runRes = await fetch(
                  `/api/issues/${issue.id}/runs/current`
                );
                if (runRes.ok) {
                  const runData = await runRes.json();
                  if (runData.transcript) {
                    setTerminalLines(runData.transcript.split("\n"));
                  }
                }
              } catch {
                // Non-fatal
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch agent activity:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id, issue?.agent_status, terminalLines.length]);

  const fetchLinkedPRs = useCallback(async () => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/pr`);
      if (res.ok) {
        const data = await res.json();
        setLinkedPRs(data);
      }
    } catch (err) {
      console.error("Failed to fetch linked PRs:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  const fetchRuns = useCallback(async () => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/runs`);
      if (res.ok) {
        const data = await res.json();
        setAgentRuns(data);
      }
    } catch (err) {
      console.error("Failed to fetch agent runs:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  const fetchHistory = useCallback(async () => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/history`);
      if (res.ok) {
        const data = await res.json();
        setIssueHistory(data);
      }
    } catch {
      // Non-fatal
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  // --- Effects ---

  useEffect(() => {
    fetchIssue().finally(() => setLoading(false));
  }, [fetchIssue]);

  useEffect(() => {
    if (issue) {
      fetchAgentActivity();
      fetchLinkedPRs();
      fetchRuns();
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    issue?.id,
    fetchAgentActivity,
    fetchLinkedPRs,
    fetchRuns,
    fetchHistory,
  ]);

  // Clear terminal when a new investigation starts
  useEffect(() => {
    if (!issue) return;
    const prev = prevAgentStatusRef.current;
    const curr = issue.agent_status;
    prevAgentStatusRef.current = curr;
    if (
      prev &&
      prev !== curr &&
      (curr === "investigating" || curr === "implementing")
    ) {
      setTerminalLines([]);
    }
  }, [issue?.agent_status]);

  // SSE connection for real-time streaming
  useEffect(() => {
    if (!issue?.id) return;

    const isAgentActive =
      issue.agent_status === "investigating" ||
      issue.agent_status === "implementing";

    if (!isAgentActive) return;

    const eventSource = new EventSource(
      `/api/issues/${issue.id}/activity/stream`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "activity") {
          setAgentActivities((prev) => {
            if (prev.some((a) => a.id === data.data.id)) return prev;
            return [...prev, data.data];
          });
        } else if (data.type === "terminal_output") {
          setTerminalLines((prev) => [...prev, data.data.content]);
        } else if (data.type === "status_update") {
          fetchIssue();
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      console.log("SSE connection lost, will reconnect...");
    };

    const issuePolling = setInterval(() => {
      fetchIssue();
    }, 5000);

    return () => {
      eventSource.close();
      clearInterval(issuePolling);
    };
  }, [issue?.id, issue?.agent_status, fetchIssue]);

  // --- Action handlers ---

  async function updateIssue(updates: Record<string, unknown>) {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.identifier}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchIssue();
      }
    } catch (err) {
      console.error("Failed to update issue:", err);
    }
  }

  async function handleSaveTitle() {
    if (titleValue.trim() && titleValue !== issue?.title) {
      await updateIssue({ title: titleValue.trim() });
    }
    setEditingTitle(false);
  }

  async function handleSaveDescription() {
    if (descriptionValue !== issue?.description) {
      await updateIssue({ description: descriptionValue });
    }
    setEditingDescription(false);
  }

  async function handleDeleteIssue() {
    if (!issue) return;
    if (!confirm("Are you sure you want to delete this mission?")) return;

    try {
      const res = await fetch(`/api/issues/${issue.identifier}`, {
        method: "DELETE",
      });
      if (res.ok) {
        goBack();
      }
    } catch (err) {
      console.error("Failed to delete issue:", err);
    }
  }

  async function handleCloseIssue() {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.identifier}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Canceled" }),
      });
      if (res.ok) {
        goBack();
      } else if (res.status === 403) {
        const data = await res.json();
        setSpawnError(data.reason || "Cannot close this issue");
      }
    } catch (err) {
      console.error("Failed to close issue:", err);
    }
  }

  async function handlePlanApprove() {
    if (!issue) return;
    setPlanActionLoading(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          auto_spawn: autoSpawnOnApprove,
        }),
      });
      if (res.ok) {
        await fetchIssue();
      }
    } catch (err) {
      console.error("Failed to approve plan:", err);
    } finally {
      setPlanActionLoading(false);
    }
  }

  async function handlePlanReject(feedback?: string) {
    const fb = feedback || planRejectFeedback.trim();
    if (!issue || !fb) return;
    setPlanActionLoading(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", feedback: fb }),
      });
      if (res.ok) {
        setPlanRejectFeedback("");
        setShowRejectForm(false);
        await fetchIssue();
      }
    } catch (err) {
      console.error("Failed to reject plan:", err);
    } finally {
      setPlanActionLoading(false);
    }
  }

  async function handleSpawn(
    type: "investigate" | "implement" | "triage" | "qa" | "research"
  ) {
    if (!issue) return;
    setSpawnLoading(true);
    setSpawnError(null);
    try {
      const res = await fetch(`/api/issues/${issue.id}/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        await fetchIssue();
      } else {
        const data = await res.json();
        const msg = data.reason || data.error || "Spawn failed";
        setSpawnError(msg);
      }
    } catch (err) {
      setSpawnError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSpawnLoading(false);
    }
  }

  async function handleCancel() {
    if (!issue) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/spawn/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        await fetchIssue();
      }
    } catch (err) {
      console.error("Cancel failed:", err);
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleRetrySpawn(data: {
    type: "investigate" | "implement" | "triage" | "qa" | "research";
    additional_context?: string;
    force?: boolean;
  }) {
    if (!issue) return;
    setSpawnLoading(true);
    setSpawnError(null);
    try {
      const res = await fetch(`/api/issues/${issue.id}/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchIssue();
      } else {
        const respData = await res.json();
        const msg = respData.reason || respData.error || "Spawn failed";
        setSpawnError(msg);
        throw new Error(msg);
      }
    } finally {
      setSpawnLoading(false);
    }
  }

  async function handleUnlinkPR(prId: string) {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/pr`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prId }),
      });
      if (res.ok) {
        await fetchLinkedPRs();
      }
    } catch (err) {
      console.error("Failed to unlink PR:", err);
    }
  }

  function goBack() {
    if (isModal && onClose) onClose();
    else router.push("/board");
  }

  // --- Derived state ---

  const isAgentActive =
    issue?.agent_status === "investigating" ||
    issue?.agent_status === "implementing";

  // Build workflow logs URL
  const workflowLogsUrl = useMemo(() => {
    if (!issue) return null;
    const activityWithUrl = [...agentActivities]
      .reverse()
      .find((a) => a.metadata?.run_url);
    if (activityWithUrl?.metadata?.run_url)
      return activityWithUrl.metadata.run_url;
    const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || "";
    if (repo && issue.spawn_run_id)
      return `https://github.com/${repo}/actions/runs/${issue.spawn_run_id}`;
    const workflow =
      issue.spawn_type === "implement"
        ? "prd-implement.yml"
        : "prd-investigate.yml";
    return repo
      ? `https://github.com/${repo}/actions/workflows/${workflow}`
      : null;
  }, [issue, agentActivities]);

  // Parse title for source/feature tags
  const titleMatch = issue?.title.match(/^\[([^\]]+)\]\s*/);
  const lokiLink = issue?.external_links?.find((l) => l.source === "loki");
  const lokiMeta = lokiLink?.metadata as Record<string, string> | null;
  const parsedSource =
    lokiMeta?.source || titleMatch?.[1]?.split("/")[0] || null;
  const parsedFeature =
    lokiMeta?.feature || titleMatch?.[1]?.split("/")[1] || null;
  const cleanTitle = titleMatch
    ? issue!.title.slice(titleMatch[0].length)
    : issue?.title || "";

  // Merge all data streams into timeline entries
  const timelineEntries = useMemo(() => {
    if (!issue) return [];
    return mergeTimeline({
      issue,
      runs: agentRuns,
      activities: agentActivities,
      history: issueHistory,
      linkedPRs,
      terminalLinesByRun: {}, // Past runs load transcript via RunCompletedEntry
      activeRunTerminalLines: terminalLines,
    });
  }, [issue, agentRuns, agentActivities, issueHistory, linkedPRs, terminalLines]);

  // --- Render ---

  if (loading) {
    return (
      <div
        className={`${isModal ? "h-full" : "min-h-screen"} flex items-center justify-center bg-[#0d0d0d]`}
      >
        <div className="spinner" />
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div
        className={`${isModal ? "h-full" : "min-h-screen"} flex flex-col items-center justify-center gap-4 bg-[#0d0d0d]`}
      >
        <div className="text-red-400 text-[14px]">
          {error || "Issue not found"}
        </div>
        <button
          onClick={goBack}
          className="text-[13px] text-[#5e6ad2] hover:text-[#6b74db]"
        >
          Back to board
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${isModal ? "h-full" : "h-screen"} flex flex-col bg-[#0d0d0d]`}
    >
      <IssueHeader
        issue={issue}
        linkedPRs={linkedPRs}
        cleanTitle={cleanTitle}
        parsedSource={parsedSource}
        parsedFeature={parsedFeature}
        isAgentActive={!!isAgentActive}
        workflowLogsUrl={workflowLogsUrl}
        spawnLoading={spawnLoading}
        cancelLoading={cancelLoading}
        onGoBack={goBack}
        onSpawn={handleSpawn}
        onCancel={handleCancel}
        onClose={handleCloseIssue}
        onDelete={handleDeleteIssue}
        onRetry={() => setShowRetryDialog(true)}
      />

      {/* Spawn error toast */}
      {spawnError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
          <svg
            className="w-3.5 h-3.5 text-red-400 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle
              cx="8"
              cy="8"
              r="7"
              stroke="currentColor"
              strokeWidth="1.25"
            />
            <path
              d="M8 5v3.5M8 10.5v.5"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-[12px] text-red-400">
            {(() => {
              try {
                const jsonMatch = spawnError.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  return parsed.message || spawnError;
                }
              } catch {
                /* fall through */
              }
              return spawnError;
            })()}
          </p>
        </div>
      )}

      {/* Editing overlays for title/description */}
      {editingTitle && (
        <div className="px-4 py-2 bg-[#0a0a0a] border-b border-[#1f1f1f]">
          <input
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveTitle();
              if (e.key === "Escape") {
                setTitleValue(issue.title);
                setEditingTitle(false);
              }
            }}
            className="w-full text-[16px] font-semibold bg-transparent text-[#f0f0f0] outline-none max-w-4xl mx-auto block"
            autoFocus
          />
        </div>
      )}

      {editingDescription && (
        <div className="px-4 py-3 bg-[#0a0a0a] border-b border-[#1f1f1f]">
          <div className="max-w-4xl mx-auto">
            <textarea
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              placeholder="Add a description..."
              rows={8}
              className="w-full bg-transparent text-[13px] text-[#c0c0c0] outline-none resize-none leading-relaxed"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSaveDescription}
                className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#5e6ad2] hover:bg-[#6b74db] rounded transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setDescriptionValue(issue.description || "");
                  setEditingDescription(false);
                }}
                className="px-2.5 py-1 text-[11px] text-[#808080] hover:text-[#c0c0c0] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main: single-column timeline */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <UnifiedTimeline
            entries={timelineEntries}
            isIdle={issue.agent_status === "idle"}
            spawnLoading={spawnLoading}
            planActionLoading={planActionLoading}
            autoSpawnOnApprove={autoSpawnOnApprove}
            onSpawn={handleSpawn}
            onCancel={handleCancel}
            onClose={handleCloseIssue}
            onPlanApprove={handlePlanApprove}
            onPlanReject={handlePlanReject}
            onSetAutoSpawn={setAutoSpawnOnApprove}
            onExpandPlan={() => setIsPlanExpanded(true)}
            onUnlinkPR={handleUnlinkPR}
            onEditTitle={() => setEditingTitle(true)}
            onEditDescription={() => setEditingDescription(true)}
          />
        </div>
      </main>

      {/* Plan Full-Screen Modal */}
      {isPlanExpanded && issue.plan_content && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPlanExpanded(false);
          }}
        >
          <div className="relative w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f1f1f] shrink-0">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-[#5e6ad2]"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <rect
                    x="2"
                    y="2"
                    width="12"
                    height="12"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.25"
                  />
                  <path
                    d="M5 6h6M5 8h6M5 10h4"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                  />
                </svg>
                <h2 className="text-[14px] font-semibold text-[#e0e0e0]">
                  Plan
                </h2>
                {issue.plan_status === "awaiting_review" && (
                  <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#facc15]/15 text-[#facc15] uppercase tracking-wide">
                    Review
                  </span>
                )}
                {issue.plan_status === "approved" && (
                  <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#4ade80]/15 text-[#4ade80] uppercase tracking-wide">
                    Approved
                  </span>
                )}
                {issue.plan_status === "needs_revision" && (
                  <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#fb923c]/15 text-[#fb923c] uppercase tracking-wide">
                    Revise
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsPlanExpanded(false)}
                className="p-1 text-[#505050] hover:text-[#e0e0e0] transition-colors rounded"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Scrollable plan content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {issue.plan_status === "needs_revision" && issue.plan_feedback && (
                <div className="mb-4 p-3 bg-[#fb923c]/5 border border-[#fb923c]/20 rounded-lg">
                  <div className="text-[11px] font-medium text-[#fb923c] mb-1">
                    Feedback
                  </div>
                  <p className="text-[12px] text-[#fb923c]/80 leading-relaxed">
                    {issue.plan_feedback}
                  </p>
                </div>
              )}
              <div
                className="prose prose-invert prose-sm max-w-none
                prose-headings:text-[#e0e0e0] prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                prose-h1:text-[16px] prose-h2:text-[14px] prose-h3:text-[13px] prose-h4:text-[12px]
                prose-p:text-[#a0a0a0] prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-1.5
                prose-strong:text-[#d0d0d0]
                prose-code:text-[#c792ea] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px]
                prose-pre:bg-[#141414] prose-pre:border prose-pre:border-[#252525] prose-pre:rounded-lg prose-pre:my-2
                prose-ul:text-[#a0a0a0] prose-ul:my-1.5 prose-li:my-0.5 prose-li:text-[13px]
                prose-ol:text-[#a0a0a0] prose-ol:my-1.5
                prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
                prose-table:text-[12px]
                prose-th:text-[#c0c0c0] prose-th:font-medium prose-th:px-2 prose-th:py-1 prose-th:border-[#252525]
                prose-td:text-[#a0a0a0] prose-td:px-2 prose-td:py-1 prose-td:border-[#252525]
              "
              >
                <ReactMarkdown>{issue.plan_content}</ReactMarkdown>
              </div>
            </div>

            {/* Modal footer with actions */}
            <div className="px-5 py-3 border-t border-[#1f1f1f] shrink-0">
              {issue.plan_status === "awaiting_review" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        handlePlanApprove();
                        setIsPlanExpanded(false);
                      }}
                      disabled={planActionLoading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#4ade80]/10 hover:bg-[#4ade80]/20 border border-[#4ade80]/30 text-[#4ade80] text-[12px] font-medium rounded-md transition-colors disabled:opacity-50"
                    >
                      {planActionLoading ? (
                        <div className="w-3 h-3 border border-[#4ade80]/40 border-t-[#4ade80] rounded-full animate-spin" />
                      ) : (
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M3 8l3.5 3.5L13 5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      Approve
                    </button>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSpawnOnApprove}
                        onChange={(e) =>
                          setAutoSpawnOnApprove(e.target.checked)
                        }
                        className="rounded border-[#333] bg-[#151515] text-[#5e6ad2] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                      />
                      <span className="text-[11px] text-[#666]">
                        Auto-implement
                      </span>
                    </label>
                    <button
                      onClick={() => setShowRejectForm(!showRejectForm)}
                      disabled={planActionLoading}
                      className="flex items-center gap-1 px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] border border-[#303030] text-[#808080] hover:text-[#e0e0e0] text-[12px] font-medium rounded-md transition-colors disabled:opacity-50 ml-auto"
                    >
                      Request Changes
                    </button>
                  </div>
                  {showRejectForm && (
                    <div className="p-3 bg-[#141414] border border-[#252525] rounded-lg">
                      <textarea
                        value={planRejectFeedback}
                        onChange={(e) =>
                          setPlanRejectFeedback(e.target.value)
                        }
                        placeholder="Describe what changes are needed..."
                        rows={3}
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#252525] rounded text-[13px] text-[#e0e0e0] placeholder-[#505050] outline-none focus:border-[#404040] resize-none transition-colors mb-2"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            handlePlanReject();
                            setIsPlanExpanded(false);
                          }}
                          disabled={
                            planActionLoading || !planRejectFeedback.trim()
                          }
                          className="px-3 py-1.5 bg-[#fb923c]/10 hover:bg-[#fb923c]/20 border border-[#fb923c]/30 text-[#fb923c] text-[12px] font-medium rounded transition-colors disabled:opacity-50"
                        >
                          Submit Feedback
                        </button>
                        <button
                          onClick={() => {
                            setShowRejectForm(false);
                            setPlanRejectFeedback("");
                          }}
                          className="px-3 py-1.5 text-[12px] text-[#808080] hover:text-[#c0c0c0] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {issue.plan_status === "needs_revision" && (
                <button
                  onClick={() => {
                    handleSpawn("investigate");
                    setIsPlanExpanded(false);
                  }}
                  disabled={spawnLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#5e6ad2] to-[#7c3aed] hover:from-[#6b74db] hover:to-[#8b5cf6] text-white text-[12px] font-medium rounded-md transition-all disabled:opacity-50"
                >
                  {spawnLoading ? (
                    <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <path
                        d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                      />
                      <path
                        d="M14 2v4h-4M2 14v-4h4"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  Re-investigate
                </button>
              )}
              {issue.plan_status === "approved" && (
                <div className="text-[12px] text-[#4ade80]/70">
                  Plan approved
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Retry Spawn Dialog */}
      <RetrySpawnDialog
        isOpen={showRetryDialog}
        onClose={() => setShowRetryDialog(false)}
        onSubmit={handleRetrySpawn}
        issueIdentifier={issue.identifier}
        hasApprovedPlan={issue.plan_status === "approved"}
        lastOutcome={issue.run_outcome}
        outcomeSummary={issue.outcome_summary}
      />
    </div>
  );
}
