"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

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
    position: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface Status {
  id: string;
  name: string;
  color: string;
  position: number;
  issues: Issue[];
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

export default function CustomerPortalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const customerSlug = params.customerSlug as string;
  const token = searchParams.get("token");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
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
          `/api/portal/${customerSlug}?token=${token}`
        );

        if (response.status === 401) {
          setError("Invalid or expired access token.");
          setLoading(false);
          return;
        }

        if (response.status === 404) {
          setError("Customer not found.");
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch data");
        }

        const data = await response.json();
        setCustomer(data.customer);
        setStatuses(data.statuses);
      } catch (err) {
        setError("Failed to load issues. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [customerSlug, token]);

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "P1":
        return (
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1l2.5 5 5.5.8-4 3.9.9 5.3L8 13.5 3.1 16l.9-5.3-4-3.9 5.5-.8L8 1z" />
          </svg>
        );
      case "P2":
        return (
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3v10h10V3H3zm9 9H4V4h8v8z" />
            <path d="M6 6h4v4H6z" />
          </svg>
        );
      default:
        return <div className="w-2 h-2 rounded-full bg-current opacity-50" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "P1":
        return "text-red-400";
      case "P2":
        return "text-orange-400";
      case "P3":
        return "text-yellow-400";
      case "P4":
        return "text-emerald-400";
      default:
        return "text-gray-400";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const totalIssues = statuses.reduce((acc, s) => acc + s.issues.length, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#333] border-t-[#666] rounded-full animate-spin" />
          <span className="text-[#555] text-sm">Loading your issues...</span>
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
          <p className="text-[#888] text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#0a0a0a]"
      style={
        {
          // Inject brand color as CSS custom property
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
          background: `radial-gradient(ellipse 80% 50% at 50% -20%, rgba(${brandColors.rgb}, 0.15), transparent)`,
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

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Customer logo/avatar */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden border border-[#252525] shadow-lg"
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
                    className="w-7 h-7 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement!.innerHTML = `<span class="text-white font-bold text-lg">${customer?.name?.[0]?.toUpperCase() || "?"}</span>`;
                    }}
                  />
                ) : (
                  <span className="text-white font-bold text-lg">
                    {customer?.name?.[0]?.toUpperCase() || "?"}
                  </span>
                )}
              </div>

              <div>
                <h1 className="text-[15px] font-semibold text-white flex items-center gap-2">
                  {customer?.name}
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `rgba(${brandColors.rgb}, 0.15)`,
                      color: brandColors.base,
                    }}
                  >
                    {totalIssues} {totalIssues === 1 ? "issue" : "issues"}
                  </span>
                </h1>
                <p className="text-[12px] text-[#666]">Issue tracking portal</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className="text-[11px] px-2.5 py-1 rounded-md border"
                style={{
                  borderColor: `rgba(${brandColors.rgb}, 0.2)`,
                  color: brandColors.base,
                  backgroundColor: `rgba(${brandColors.rgb}, 0.05)`,
                }}
              >
                Read-only
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Kanban Board */}
      <div className="relative p-4 sm:p-6 pb-20">
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {statuses
            .sort((a, b) => a.position - b.position)
            .map((status) => (
              <div
                key={status.id}
                className="flex-shrink-0 w-[320px] flex flex-col max-h-[calc(100vh-180px)]"
              >
                {/* Column Header */}
                <div className="flex items-center gap-2 px-1 mb-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: status.color,
                      boxShadow: `0 0 0 2px #0a0a0a, 0 0 0 4px ${status.color}40`,
                    }}
                  />
                  <span className="text-[13px] font-medium text-[#e5e5e5]">
                    {status.name}
                  </span>
                  <span className="text-[12px] text-[#555] tabular-nums">
                    {status.issues.length}
                  </span>
                </div>

                {/* Column content */}
                <div className="flex-1 overflow-y-auto rounded-xl bg-[#111]/50 border border-[#1a1a1a] p-2 space-y-2">
                  {status.issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center mb-2">
                        <svg
                          className="w-5 h-5 text-[#333]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                      </div>
                      <span className="text-[12px] text-[#444]">No issues</span>
                    </div>
                  ) : (
                    status.issues.map((issue) => (
                      <div
                        key={issue.id}
                        onClick={() =>
                          router.push(
                            `/portal/${customerSlug}/issue/${issue.identifier}?token=${token}`
                          )
                        }
                        className="group bg-[#141414] border border-[#1f1f1f] hover:border-[#2a2a2a] rounded-lg p-3 cursor-pointer transition-all duration-200 hover:bg-[#161616]"
                        style={{
                          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                        }}
                      >
                        {/* Issue identifier and priority */}
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`${getPriorityColor(issue.priority)}`}
                          >
                            {getPriorityIcon(issue.priority)}
                          </span>
                          <span
                            className="text-[11px] font-mono font-medium"
                            style={{ color: brandColors.base }}
                          >
                            {issue.identifier}
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="text-[13px] text-[#e5e5e5] font-medium leading-snug mb-3 line-clamp-2 group-hover:text-white transition-colors">
                          {issue.title}
                        </h3>

                        {/* Footer */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#555]">
                            {formatDate(issue.updatedAt)}
                          </span>
                          {issue.reporterName && (
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-medium text-white"
                                style={{ backgroundColor: brandColors.base }}
                              >
                                {issue.reporterName[0]?.toUpperCase()}
                              </div>
                              <span className="text-[11px] text-[#555] truncate max-w-[80px]">
                                {issue.reporterName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-[#1a1a1a] bg-[#0d0d0d]/90 backdrop-blur-xl z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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
          <div
            className="text-[11px] px-2 py-0.5 rounded"
            style={{
              color: brandColors.base,
              backgroundColor: `rgba(${brandColors.rgb}, 0.1)`,
            }}
          >
            Last updated:{" "}
            {new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>
      </footer>

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .scrollbar-thin::-webkit-scrollbar {
          height: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: #111;
          border-radius: 3px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 3px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #444;
        }
      `}</style>
    </div>
  );
}
