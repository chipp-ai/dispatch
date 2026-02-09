"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

interface Comment {
  id: string;
  body: string;
  author: {
    name: string;
  } | null;
  createdAt: string;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  reporterName: string | null;
  status: {
    id: string;
    name: string;
    color: string;
  };
  agentStatus: string;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
  watcherCount: number;
}

interface Customer {
  name: string;
  slug: string;
  brandColor: string | null;
  logoUrl: string | null;
}

// Helper to generate lighter/darker shades from hex
function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}

// Convert hex to RGB for CSS custom properties
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "99, 102, 241";
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

export default function CustomerIssueDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const customerSlug = params.customerSlug as string;
  const identifier = params.identifier as string;
  const token = searchParams.get("token");

  const [issue, setIssue] = useState<Issue | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute brand color values
  const brandColors = useMemo(() => {
    const baseColor = customer?.brandColor || "#6366f1";
    return {
      base: baseColor,
      rgb: hexToRgb(baseColor),
      light: adjustColor(baseColor, 40),
      dark: adjustColor(baseColor, -30),
    };
  }, [customer?.brandColor]);

  useEffect(() => {
    if (!token) {
      setError("Access denied. Please use the link provided in Slack.");
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        const response = await fetch(
          `/api/portal/${customerSlug}/issue/${identifier}?token=${token}`
        );

        if (response.status === 401) {
          setError("Invalid or expired access token.");
          setLoading(false);
          return;
        }

        if (response.status === 404) {
          setError("Issue not found or you don't have access to it.");
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch data");
        }

        const data = await response.json();
        setIssue(data.issue);
        setCustomer(data.customer);
      } catch (err) {
        setError("Failed to load issue. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [customerSlug, identifier, token]);

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "P1":
        return {
          label: "Urgent",
          color: "bg-red-500/20 text-red-400",
          icon: "!",
        };
      case "P2":
        return {
          label: "High",
          color: "bg-orange-500/20 text-orange-400",
          icon: "!!",
        };
      case "P3":
        return {
          label: "Normal",
          color: "bg-yellow-500/20 text-yellow-400",
          icon: "-",
        };
      case "P4":
        return {
          label: "Low",
          color: "bg-emerald-500/20 text-emerald-400",
          icon: "...",
        };
      default:
        return {
          label: priority,
          color: "bg-gray-500/20 text-gray-400",
          icon: "-",
        };
    }
  };

  const getAgentStatusLabel = (status: string) => {
    switch (status) {
      case "idle":
        return { label: "Queued", color: "text-[#666]", bg: "bg-[#1a1a1a]" };
      case "investigating":
        return {
          label: "Investigating",
          color: "text-blue-400",
          bg: "bg-blue-500/10",
        };
      case "implementing":
        return {
          label: "Implementing Fix",
          color: "text-purple-400",
          bg: "bg-purple-500/10",
        };
      case "blocked":
        return { label: "Blocked", color: "text-red-400", bg: "bg-red-500/10" };
      case "awaiting_review":
        return {
          label: "Awaiting Review",
          color: "text-yellow-400",
          bg: "bg-yellow-500/10",
        };
      default:
        return { label: status, color: "text-[#666]", bg: "bg-[#1a1a1a]" };
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#333] border-t-[#666] rounded-full animate-spin" />
          <span className="text-[#555] text-sm">Loading issue...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-[#111] border border-[#222] rounded-xl p-8 max-w-md text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">
            Access Denied
          </h2>
          <p className="text-[#888] text-sm mb-4">{error}</p>
          <button
            onClick={() =>
              router.push(`/portal/${customerSlug}?token=${token}`)
            }
            className="text-sm px-4 py-2 rounded-lg transition-colors"
            style={{
              backgroundColor: `rgba(${brandColors.rgb}, 0.15)`,
              color: brandColors.base,
            }}
          >
            Back to Issues
          </button>
        </div>
      </div>
    );
  }

  if (!issue) return null;

  const priorityInfo = getPriorityLabel(issue.priority);
  const agentInfo = getAgentStatusLabel(issue.agentStatus);

  return (
    <div
      className="min-h-screen bg-[#0a0a0a]"
      style={
        {
          "--brand-color": brandColors.base,
          "--brand-rgb": brandColors.rgb,
          "--brand-light": brandColors.light,
          "--brand-dark": brandColors.dark,
        } as React.CSSProperties
      }
    >
      {/* Subtle gradient background with brand color */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% -20%, rgba(${brandColors.rgb}, 0.12), transparent)`,
        }}
      />

      {/* Header */}
      <header className="relative border-b border-[#1a1a1a] bg-[#0d0d0d]/80 backdrop-blur-xl sticky top-0 z-20">
        {/* Brand accent line */}
        <div
          className="h-[2px] w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${brandColors.base}, transparent)`,
          }}
        />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                router.push(`/portal/${customerSlug}?token=${token}`)
              }
              className="w-8 h-8 rounded-lg bg-[#141414] border border-[#252525] flex items-center justify-center text-[#666] hover:text-[#888] hover:border-[#333] transition-all"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>

            <div className="flex items-center gap-3">
              {/* Customer logo/avatar */}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden border border-[#252525]"
                style={{
                  background: customer?.logoUrl
                    ? "#111"
                    : `linear-gradient(135deg, ${brandColors.base}, ${brandColors.light})`,
                }}
              >
                {customer?.logoUrl ? (
                  <img
                    src={customer.logoUrl}
                    alt={customer?.name || ""}
                    className="w-5 h-5 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement!.innerHTML = `<span class="text-white font-bold text-sm">${customer?.name?.[0]?.toUpperCase() || "?"}</span>`;
                    }}
                  />
                ) : (
                  <span className="text-white font-bold text-sm">
                    {customer?.name?.[0]?.toUpperCase() || "?"}
                  </span>
                )}
              </div>

              <div>
                <div className="text-[12px] text-[#666]">{customer?.name}</div>
                <div
                  className="text-[13px] font-mono font-medium"
                  style={{ color: brandColors.base }}
                >
                  {issue.identifier}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Issue Header */}
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-semibold text-white mb-4 leading-tight">
            {issue.title}
          </h1>

          <div className="flex flex-wrap gap-2">
            {/* Status Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#141414] border border-[#252525] rounded-lg">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: issue.status.color,
                  boxShadow: `0 0 0 1px #141414, 0 0 0 3px ${issue.status.color}40`,
                }}
              />
              <span className="text-[12px] font-medium text-[#e5e5e5]">
                {issue.status.name}
              </span>
            </div>

            {/* Priority Badge */}
            <div
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${priorityInfo.color}`}
            >
              {priorityInfo.label}
            </div>

            {/* Agent Status */}
            {issue.agentStatus !== "idle" && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${agentInfo.bg}`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                <span className={`text-[12px] font-medium ${agentInfo.color}`}>
                  {agentInfo.label}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {issue.description && (
          <div className="mb-8">
            <h2 className="text-[11px] font-medium text-[#555] uppercase tracking-wider mb-3">
              Description
            </h2>
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <div className="text-[14px] text-[#ccc] whitespace-pre-wrap leading-relaxed">
                {issue.description}
              </div>
            </div>
          </div>
        )}

        {/* Timeline / Comments */}
        <div className="mb-8">
          <h2 className="text-[11px] font-medium text-[#555] uppercase tracking-wider mb-3">
            Activity
          </h2>

          <div className="space-y-0">
            {/* Created Event */}
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `rgba(${brandColors.rgb}, 0.15)` }}
                >
                  <svg
                    className="w-4 h-4"
                    style={{ color: brandColors.base }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </div>
                {issue.comments.length > 0 && (
                  <div className="w-px flex-1 bg-[#1f1f1f] mt-2 min-h-[16px]" />
                )}
              </div>
              <div className="flex-1 pb-6">
                <div className="text-[13px] text-[#888]">Issue created</div>
                <div className="text-[11px] text-[#555]">
                  {formatDate(issue.createdAt)}
                </div>
              </div>
            </div>

            {/* Comments */}
            {issue.comments.map((comment, index) => (
              <div key={comment.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: `rgba(${brandColors.rgb}, 0.15)`,
                    }}
                  >
                    <svg
                      className="w-4 h-4"
                      style={{ color: brandColors.base }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                  </div>
                  {index < issue.comments.length - 1 && (
                    <div className="w-px flex-1 bg-[#1f1f1f] mt-2 min-h-[16px]" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white"
                          style={{ backgroundColor: brandColors.base }}
                        >
                          {(comment.author?.name || "S")[0].toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium text-[#e5e5e5]">
                          {comment.author?.name || "System"}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#555]">
                        {formatRelativeDate(comment.createdAt)}
                      </span>
                    </div>
                    <div className="text-[13px] text-[#aaa] whitespace-pre-wrap leading-relaxed">
                      {comment.body}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Metadata */}
        <div className="border-t border-[#1a1a1a] pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-3">
              <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">
                Created
              </div>
              <div className="text-[12px] text-[#ccc]">
                {formatDate(issue.createdAt)}
              </div>
            </div>
            <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-3">
              <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">
                Last Updated
              </div>
              <div className="text-[12px] text-[#ccc]">
                {formatDate(issue.updatedAt)}
              </div>
            </div>
            {issue.reporterName && (
              <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-3">
                <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">
                  Reported By
                </div>
                <div className="text-[12px] text-[#ccc]">
                  {issue.reporterName}
                </div>
              </div>
            )}
            <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-3">
              <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">
                Watchers
              </div>
              <div className="text-[12px] text-[#ccc]">
                {issue.watcherCount}{" "}
                {issue.watcherCount === 1 ? "customer" : "customers"}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-[#1a1a1a] bg-[#0d0d0d]/90 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-[#555]">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Powered by Dispatch
          </div>
          <span
            className="text-[11px] px-2 py-0.5 rounded"
            style={{
              color: brandColors.base,
              backgroundColor: `rgba(${brandColors.rgb}, 0.1)`,
            }}
          >
            Read-only
          </span>
        </div>
      </footer>
    </div>
  );
}
