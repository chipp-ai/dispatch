"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import KanbanBoard from "@/components/KanbanBoard";
import CreateIssueModal from "@/components/CreateIssueModal";
import SearchModal from "@/components/SearchModal";
import ImportEmptyState from "@/components/ImportEmptyState";
import GuideOverlay, { hasSeenGuide, markGuideComplete } from "@/components/GuideOverlay";
import Terminal from "@/components/terminal/Terminal";

type ViewType = "terminal" | "board";

interface Status {
  id: string;
  name: string;
  color: string;
  position: number;
  is_closed: boolean;
}

interface Label {
  id: string;
  name: string;
  color: string;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status_id: string;
  assignee: { name: string } | null;
  labels: { label: { id: string; name: string; color: string } }[];
  created_at: string;
  agent_status?: string;
  plan_status?: string;
  blocked_reason?: string | null;
  cost_usd?: number | null;
  run_outcome?: string | null;
  outcome_summary?: string | null;
}

interface BoardEvent {
  type:
    | "connected"
    | "issue_created"
    | "issue_updated"
    | "issue_deleted"
    | "issue_moved";
  issue?: Issue;
  previousStatusId?: string;
  timestamp: string;
}

type ViewMode = "all" | "active" | "backlog";

export default function BoardPage() {
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [isConnected, setIsConnected] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{
    prsProcessed: number;
    issuesUpdated: number;
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [viewType, setViewType] = useState<ViewType>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("dispatch_view_type") as ViewType) || "terminal";
    }
    return "terminal";
  });

  // Persist view preference
  useEffect(() => {
    localStorage.setItem("dispatch_view_type", viewType);
  }, [viewType]);

  const fetchData = useCallback(async () => {
    try {
      const [issuesRes, statusesRes, labelsRes] = await Promise.all([
        fetch("/api/issues"),
        fetch("/api/statuses"),
        fetch("/api/labels"),
      ]);

      if (!issuesRes.ok || !statusesRes.ok || !labelsRes.ok) {
        if (issuesRes.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch data");
      }

      const [issuesData, statusesData, labelsData] = await Promise.all([
        issuesRes.json(),
        statusesRes.json(),
        labelsRes.json(),
      ]);

      setIssues(issuesData);
      setStatuses(statusesData);
      setLabels(labelsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // SSE connection for live updates
  useEffect(() => {
    const connectSSE = () => {
      const eventSource = new EventSource("/api/board/stream");
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data: BoardEvent = JSON.parse(event.data);

          switch (data.type) {
            case "connected":
              console.log("[Board SSE] Connected");
              break;

            case "issue_created":
              if (data.issue) {
                setIssues((prev) => {
                  // Avoid duplicates
                  if (prev.some((i) => i.id === data.issue!.id)) return prev;
                  return [data.issue!, ...prev];
                });
              }
              break;

            case "issue_updated":
            case "issue_moved":
              if (data.issue) {
                setIssues((prev) =>
                  prev.map((issue) =>
                    issue.id === data.issue!.id ? data.issue! : issue
                  )
                );
              }
              break;

            case "issue_deleted":
              if (data.issue) {
                setIssues((prev) =>
                  prev.filter((issue) => issue.id !== data.issue!.id)
                );
              }
              break;
          }
        } catch (e) {
          // Ignore parse errors (ping messages, etc.)
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        // Reconnect after 3 seconds
        setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // First-visit guide auto-show
  useEffect(() => {
    if (!hasSeenGuide()) {
      const timer = setTimeout(() => setShowGuide(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+` to toggle terminal/board
      if (e.key === "`" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setViewType((prev) => (prev === "terminal" ? "board" : "terminal"));
        return;
      }

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowCreateModal(true);
      }

      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowSearchModal(true);
      }

      if (e.key === "Escape") {
        if (showCreateModal) setShowCreateModal(false);
        if (showSearchModal) setShowSearchModal(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCreateModal, showSearchModal]);

  async function handleMoveIssue(issueId: string, newStatusId: string) {
    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId ? { ...issue, status_id: newStatusId } : issue
      )
    );

    try {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: newStatusId }),
      });

      if (!res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error moving issue:", error);
      fetchData();
    }
  }

  async function handleCreateIssue(data: {
    title: string;
    description: string;
    priority: string;
    statusId: string;
    labelIds: string[];
    assigneeName: string;
  }) {
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      throw new Error("Failed to create issue");
    }

    await fetchData();
  }

  async function handleReconcile() {
    if (isReconciling) return;

    setIsReconciling(true);
    setReconcileResult(null);

    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error("Reconciliation failed");
      }

      const result = await res.json();
      setReconcileResult({
        prsProcessed: result.prsProcessed,
        issuesUpdated: result.issuesUpdated,
      });

      // Refresh data after reconciliation
      await fetchData();

      // Clear result after 5 seconds
      setTimeout(() => setReconcileResult(null), 5000);
    } catch (error) {
      console.error("Reconciliation error:", error);
    } finally {
      setIsReconciling(false);
    }
  }

  // Filter statuses based on view mode
  const getFilteredStatuses = () => {
    const sortedStatuses = [...statuses].sort(
      (a, b) => a.position - b.position
    );

    switch (viewMode) {
      case "active":
        // Show only non-backlog, non-closed statuses
        return sortedStatuses.filter(
          (s) => !s.is_closed && s.name.toLowerCase() !== "backlog"
        );
      case "backlog":
        // Show only backlog
        return sortedStatuses.filter((s) => s.name.toLowerCase() === "backlog");
      default:
        return sortedStatuses;
    }
  };

  // Get issue counts by status type
  const getIssueCounts = () => {
    const activeStatuses = statuses.filter(
      (s) => !s.is_closed && s.name.toLowerCase() !== "backlog"
    );
    const backlogStatuses = statuses.filter(
      (s) => s.name.toLowerCase() === "backlog"
    );

    const activeCount = issues.filter((i) =>
      activeStatuses.some((s) => s.id === i.status_id)
    ).length;
    const backlogCount = issues.filter((i) =>
      backlogStatuses.some((s) => s.id === i.status_id)
    ).length;

    return { active: activeCount, backlog: backlogCount, all: issues.length };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]">
        <div className="spinner" />
      </div>
    );
  }

  const counts = getIssueCounts();
  const filteredStatuses = getFilteredStatuses();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        onCreateIssue={() => setShowCreateModal(true)}
        onOpenGuide={() => setShowGuide(true)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        viewType={viewType}
        onViewTypeChange={setViewType}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {viewType === "terminal" ? (
          /* Terminal view — full area */
          <main className="flex-1 overflow-hidden">
            <Terminal />
          </main>
        ) : (
          <>
            {/* Header — board view only */}
            <header className="h-12 border-b border-[#252525] flex items-center justify-between px-3 md:px-4">
              <div className="flex items-center gap-3 md:gap-6 min-w-0">
                {/* Mobile hamburger */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-1.5 -ml-1 text-[#888] hover:text-[#e0e0e0] hover:bg-[#1a1a1a] rounded transition-colors md:hidden"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>

                <h1 className="text-[14px] font-semibold text-[#f5f5f5] hidden md:block">Issues</h1>

                {/* View tabs */}
                <div className="flex items-center gap-0.5 md:gap-1 overflow-x-auto">
                  <ViewTab
                    label="All"
                    count={counts.all}
                    active={viewMode === "all"}
                    onClick={() => setViewMode("all")}
                  />
                  <ViewTab
                    label="Active"
                    count={counts.active}
                    active={viewMode === "active"}
                    onClick={() => setViewMode("active")}
                  />
                  <ViewTab
                    label="Backlog"
                    count={counts.backlog}
                    active={viewMode === "backlog"}
                    onClick={() => setViewMode("backlog")}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                {/* Reconcile result toast */}
                {reconcileResult && (
                  <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-[#4ade80] bg-[#4ade8015] rounded">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {reconcileResult.prsProcessed} PRs,{" "}
                    {reconcileResult.issuesUpdated} issues updated
                  </div>
                )}

                {/* Live indicator */}
                <div className="flex items-center gap-1.5 px-1.5 md:px-2 py-1 text-[11px] text-[#666]">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected ? "bg-green-500" : "bg-[#555]"
                    }`}
                  />
                  <span className="hidden sm:inline">{isConnected ? "Live" : "Offline"}</span>
                </div>

                {/* Reconcile button */}
                <button
                  onClick={handleReconcile}
                  disabled={isReconciling}
                  className={`flex items-center gap-1.5 p-1.5 md:px-2.5 md:py-1 text-[12px] rounded transition-colors ${
                    isReconciling
                      ? "text-[#555] cursor-not-allowed"
                      : "text-[#5e6ad2] hover:text-[#7b83dc] hover:bg-[#5e6ad215]"
                  }`}
                  title="Reconcile"
                >
                  <ReconcileIcon spinning={isReconciling} />
                  <span className="hidden md:inline">{isReconciling ? "Syncing..." : "Reconcile"}</span>
                </button>

                {/* Filter button */}
                <button className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-[#888] hover:text-[#ccc] hover:bg-[#1a1a1a] rounded transition-colors">
                  <FilterIcon />
                  Filter
                </button>

                {/* Display button */}
                <button className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-[#888] hover:text-[#ccc] hover:bg-[#1a1a1a] rounded transition-colors">
                  <DisplayIcon />
                  Display
                </button>

                {/* Mobile create button */}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="p-1.5 text-[#5e6ad2] hover:text-[#7b83dc] hover:bg-[#5e6ad215] rounded transition-colors md:hidden"
                  title="New Issue"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </header>

            {/* Main content - overflow-hidden so columns scroll independently */}
            <main className="flex-1 overflow-hidden p-2 md:p-4">
              {issues.length === 0 ? (
                <ImportEmptyState onImportComplete={fetchData} />
              ) : (
                <KanbanBoard
                  statuses={filteredStatuses}
                  issues={issues}
                  onMoveIssue={handleMoveIssue}
                />
              )}
            </main>
          </>
        )}
      </div>

      {/* Modals */}
      <CreateIssueModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateIssue}
        statuses={statuses}
        labels={labels}
      />

      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />

      <GuideOverlay
        isOpen={showGuide}
        onClose={() => {
          markGuideComplete();
          setShowGuide(false);
        }}
      />
    </div>
  );
}

interface ViewTabProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function ViewTab({ label, count, active, onClick }: ViewTabProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-1.5 md:py-1 text-[12px] rounded transition-colors whitespace-nowrap ${
        active
          ? "bg-[#1f1f1f] text-[#f5f5f5]"
          : "text-[#666] hover:text-[#888] hover:bg-[#1a1a1a]"
      }`}
    >
      {label}
      <span className={active ? "text-[#888]" : "text-[#555]"}>{count}</span>
    </button>
  );
}

function FilterIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
  );
}

function DisplayIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 6h16M4 10h16M4 14h16M4 18h16"
      />
    </svg>
  );
}

function ReconcileIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}
