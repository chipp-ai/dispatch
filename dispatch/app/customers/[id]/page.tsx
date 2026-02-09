"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

interface CustomerHealthMetrics {
  customerId: string;
  customerName: string;
  totalIssues: number;
  openIssues: number;
  closedIssues: number;
  staleIssues: number;
  criticalStale: number;
  unrespondedIssues: number;
  highPriorityOpen: number;
  lastActivityAt: string | null;
  lastIssueCreatedAt: string | null;
  avgResponseTimeHours: number | null;
  daysSinceActivity: number | null;
}

interface CustomerIssue {
  id: string;
  identifier: string;
  title: string;
  priority: string;
  statusName: string;
  statusColor: string;
  createdAt: string;
  updatedAt: string;
  daysSinceUpdate: number;
  commentCount: number;
  hasTeamResponse: boolean;
}

interface CustomerActivity {
  type: "issue_created" | "issue_updated" | "comment_added" | "status_changed";
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  description: string;
  timestamp: string;
  actorName: string | null;
}

interface Customer {
  id: string;
  name: string;
  slug: string;
  slackChannelId: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  portalToken: string;
}

type IssueFilter = "all" | "stale" | "unresponded" | "critical";

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [metrics, setMetrics] = useState<CustomerHealthMetrics | null>(null);
  const [issues, setIssues] = useState<CustomerIssue[]>([]);
  const [activity, setActivity] = useState<CustomerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<IssueFilter>("all");

  const fetchCustomer = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          router.push("/customers");
          return;
        }
        throw new Error("Failed to fetch customer");
      }
      const data = await res.json();
      setCustomer(data.customer);
    } catch (error) {
      console.error("Error fetching customer:", error);
    }
  }, [id, router]);

  const fetchStats = useCallback(
    async (filter: IssueFilter = "all") => {
      try {
        const res = await fetch(
          `/api/customers/${id}/stats?filter=${filter}&limit=50`
        );
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setMetrics(data.metrics);
        setIssues(data.issues || []);
        setActivity(data.activity || []);
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    },
    [id]
  );

  useEffect(() => {
    Promise.all([fetchCustomer(), fetchStats()]).finally(() =>
      setLoading(false)
    );
  }, [fetchCustomer, fetchStats]);

  const handleFilterChange = (filter: IssueFilter) => {
    setActiveFilter(filter);
    fetchStats(filter);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]">
        <div className="spinner" />
      </div>
    );
  }

  if (!customer || !metrics) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]">
        <p className="text-[#666]">Customer not found</p>
      </div>
    );
  }

  const healthScore = calculateHealthScore(metrics);
  const baseColor = customer.brandColor || "#5e6ad2";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden bg-[#0d0d0d]">
        {/* Header */}
        <header className="h-12 border-b border-[#252525] flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/customers")}
              className="text-[#666] hover:text-[#888] transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: baseColor }}
            >
              {customer.logoUrl ? (
                <img
                  src={customer.logoUrl}
                  alt={customer.name}
                  className="w-5 h-5 object-contain"
                />
              ) : (
                <span className="text-sm font-bold text-white">
                  {customer.name[0].toUpperCase()}
                </span>
              )}
            </div>
            <h1 className="text-[14px] font-semibold text-[#f5f5f5]">
              {customer.name}
            </h1>
            {customer.slackChannelId && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-[#1a1a1a] rounded text-[10px] text-[#888]">
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
                </svg>
                Connected
              </span>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          {/* Health Overview */}
          <div className="mb-8">
            <h2 className="text-[13px] font-semibold text-[#888] uppercase tracking-wider mb-4">
              Health Overview
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <HealthCard
                label="Health Score"
                value={healthScore}
                suffix="/100"
                color={getHealthColor(healthScore)}
                large
              />
              <HealthCard
                label="Open Issues"
                value={metrics.openIssues}
                subtext={`of ${metrics.totalIssues} total`}
              />
              <HealthCard
                label="Stale Issues"
                value={metrics.staleIssues}
                subtext="3+ days no update"
                color={metrics.staleIssues > 0 ? "#f59e0b" : undefined}
                alert={metrics.staleIssues > 0}
              />
              <HealthCard
                label="Critical Stale"
                value={metrics.criticalStale}
                subtext="P1/P2, 2+ days"
                color={metrics.criticalStale > 0 ? "#ef4444" : undefined}
                alert={metrics.criticalStale > 0}
              />
              <HealthCard
                label="No Response"
                value={metrics.unrespondedIssues}
                subtext="Awaiting reply"
                color={metrics.unrespondedIssues > 0 ? "#f59e0b" : undefined}
                alert={metrics.unrespondedIssues > 0}
              />
              <HealthCard
                label="High Priority"
                value={metrics.highPriorityOpen}
                subtext="P1/P2 open"
                color={metrics.highPriorityOpen > 0 ? "#ef4444" : undefined}
              />
            </div>
          </div>

          {/* Activity & Response Stats */}
          <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#141414] border border-[#252525] rounded-lg p-4">
              <p className="text-[11px] text-[#666] uppercase tracking-wider mb-1">
                Last Activity
              </p>
              <p className="text-[18px] font-semibold text-[#f5f5f5]">
                {metrics.lastActivityAt
                  ? formatRelativeTime(new Date(metrics.lastActivityAt))
                  : "Never"}
              </p>
              {metrics.daysSinceActivity !== null &&
                metrics.daysSinceActivity > 7 && (
                  <p className="text-[11px] text-[#f59e0b] mt-1">
                    {metrics.daysSinceActivity} days ago
                  </p>
                )}
            </div>
            <div className="bg-[#141414] border border-[#252525] rounded-lg p-4">
              <p className="text-[11px] text-[#666] uppercase tracking-wider mb-1">
                Avg Response Time
              </p>
              <p className="text-[18px] font-semibold text-[#f5f5f5]">
                {metrics.avgResponseTimeHours !== null
                  ? formatHours(metrics.avgResponseTimeHours)
                  : "N/A"}
              </p>
            </div>
            <div className="bg-[#141414] border border-[#252525] rounded-lg p-4">
              <p className="text-[11px] text-[#666] uppercase tracking-wider mb-1">
                Resolution Rate
              </p>
              <p className="text-[18px] font-semibold text-[#f5f5f5]">
                {metrics.totalIssues > 0
                  ? Math.round(
                      (metrics.closedIssues / metrics.totalIssues) * 100
                    )
                  : 0}
                %
              </p>
              <p className="text-[11px] text-[#666] mt-1">
                {metrics.closedIssues} of {metrics.totalIssues} resolved
              </p>
            </div>
          </div>

          {/* Issues Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-semibold text-[#888] uppercase tracking-wider">
                Issues
              </h2>
              <div className="flex gap-2">
                {(["all", "critical", "stale", "unresponded"] as const).map(
                  (filter) => (
                    <button
                      key={filter}
                      onClick={() => handleFilterChange(filter)}
                      className={`px-3 py-1 text-[11px] rounded-md transition-colors ${
                        activeFilter === filter
                          ? "bg-[#5e6ad2] text-white"
                          : "bg-[#1a1a1a] text-[#888] hover:text-[#ccc]"
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  )
                )}
              </div>
            </div>
            <div className="bg-[#141414] border border-[#252525] rounded-lg overflow-hidden">
              {issues.length === 0 ? (
                <div className="p-8 text-center text-[#666] text-[13px]">
                  No issues found
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#252525]">
                      <th className="text-left px-4 py-2 text-[11px] text-[#666] font-medium">
                        Issue
                      </th>
                      <th className="text-left px-4 py-2 text-[11px] text-[#666] font-medium w-20">
                        Priority
                      </th>
                      <th className="text-left px-4 py-2 text-[11px] text-[#666] font-medium w-28">
                        Status
                      </th>
                      <th className="text-left px-4 py-2 text-[11px] text-[#666] font-medium w-24">
                        Last Update
                      </th>
                      <th className="text-left px-4 py-2 text-[11px] text-[#666] font-medium w-24">
                        Response
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map((issue) => (
                      <tr
                        key={issue.id}
                        className="border-b border-[#1f1f1f] hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                        onClick={() =>
                          router.push(`/issue/${issue.identifier}`)
                        }
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-[#666] font-mono">
                              {issue.identifier}
                            </span>
                            <span className="text-[13px] text-[#f5f5f5] truncate max-w-[300px]">
                              {issue.title}
                            </span>
                            {issue.daysSinceUpdate >= 3 && (
                              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] rounded">
                                STALE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={issue.priority} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-1 rounded text-[11px]"
                            style={{
                              backgroundColor: issue.statusColor + "20",
                              color: issue.statusColor,
                            }}
                          >
                            {issue.statusName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[#888]">
                          {issue.daysSinceUpdate === 0
                            ? "Today"
                            : `${issue.daysSinceUpdate}d ago`}
                        </td>
                        <td className="px-4 py-3">
                          {issue.hasTeamResponse ? (
                            <span className="text-[11px] text-green-400">
                              {issue.commentCount} comment
                              {issue.commentCount !== 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-400">
                              No response
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h2 className="text-[13px] font-semibold text-[#888] uppercase tracking-wider mb-4">
              Recent Activity
            </h2>
            <div className="bg-[#141414] border border-[#252525] rounded-lg overflow-hidden">
              {activity.length === 0 ? (
                <div className="p-8 text-center text-[#666] text-[13px]">
                  No recent activity
                </div>
              ) : (
                <div className="divide-y divide-[#1f1f1f]">
                  {activity.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-4 py-3 hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                      onClick={() =>
                        router.push(`/issue/${item.issueIdentifier}`)
                      }
                    >
                      <div className="flex items-start gap-3">
                        <ActivityIcon type={item.type} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-[#666] font-mono">
                              {item.issueIdentifier}
                            </span>
                            <span className="text-[13px] text-[#f5f5f5] truncate">
                              {item.issueTitle}
                            </span>
                          </div>
                          <p className="text-[12px] text-[#888] mt-0.5 truncate">
                            {item.actorName && (
                              <span className="text-[#ccc]">
                                {item.actorName}:{" "}
                              </span>
                            )}
                            {item.description}
                          </p>
                        </div>
                        <span className="text-[11px] text-[#555] flex-shrink-0">
                          {formatRelativeTime(new Date(item.timestamp))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// Helper Components
function HealthCard({
  label,
  value,
  suffix,
  subtext,
  color,
  alert,
  large,
}: {
  label: string;
  value: number;
  suffix?: string;
  subtext?: string;
  color?: string;
  alert?: boolean;
  large?: boolean;
}) {
  return (
    <div
      className={`bg-[#141414] border rounded-lg p-4 ${
        alert ? "border-amber-500/50" : "border-[#252525]"
      }`}
    >
      <p className="text-[11px] text-[#666] uppercase tracking-wider mb-1">
        {label}
      </p>
      <p
        className={`font-semibold ${large ? "text-[24px]" : "text-[18px]"}`}
        style={{ color: color || "#f5f5f5" }}
      >
        {value}
        {suffix && <span className="text-[#666] text-[14px]">{suffix}</span>}
      </p>
      {subtext && <p className="text-[11px] text-[#666] mt-1">{subtext}</p>}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    P1: { bg: "bg-red-500/20", text: "text-red-400" },
    P2: { bg: "bg-orange-500/20", text: "text-orange-400" },
    P3: { bg: "bg-blue-500/20", text: "text-blue-400" },
    P4: { bg: "bg-gray-500/20", text: "text-gray-400" },
  };
  const { bg, text } = config[priority] || config.P3;
  return (
    <span
      className={`px-2 py-0.5 rounded text-[11px] font-medium ${bg} ${text}`}
    >
      {priority}
    </span>
  );
}

function ActivityIcon({
  type,
}: {
  type: "issue_created" | "issue_updated" | "comment_added" | "status_changed";
}) {
  const icons: Record<typeof type, JSX.Element> = {
    issue_created: (
      <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
        <svg
          className="w-3 h-3 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </div>
    ),
    issue_updated: (
      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
        <svg
          className="w-3 h-3 text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </div>
    ),
    comment_added: (
      <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
        <svg
          className="w-3 h-3 text-purple-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
    ),
    status_changed: (
      <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
        <svg
          className="w-3 h-3 text-yellow-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
          />
        </svg>
      </div>
    ),
  };
  return icons[type];
}

// Helper Functions
function calculateHealthScore(metrics: CustomerHealthMetrics): number {
  let score = 100;
  // Critical stale issues are severe (-20 each, max -60)
  score -= Math.min(metrics.criticalStale * 20, 60);
  // Stale issues reduce score (-10 each, max -30)
  score -= Math.min(metrics.staleIssues * 10, 30);
  // High priority open issues reduce score (-5 each, max -20)
  score -= Math.min(metrics.highPriorityOpen * 5, 20);
  // Days since activity penalty (after 7 days)
  if (metrics.daysSinceActivity !== null && metrics.daysSinceActivity > 7) {
    score -= Math.min((metrics.daysSinceActivity - 7) * 2, 20);
  }
  return Math.max(0, score);
}

function getHealthColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
