"use client";

interface Customer {
  id: string;
  name: string;
  slug: string;
  portalToken: string;
  slackChannelId: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  issueCount: number;
  createdAt: string;
}

interface CustomerCardProps {
  customer: Customer;
  rank: number;
  isDragging: boolean;
  isCopied: boolean;
  onDragStart: (e: React.DragEvent, customer: Customer) => void;
  onDragOver: (e: React.DragEvent, customer: Customer) => void;
  onDragEnd: () => void;
  onCopyLink: (customer: Customer) => void;
  onViewIssues: () => void;
  onViewDetails?: () => void;
}

// Generate consistent color from string (fallback when no brand color)
function stringToColor(str: string): string {
  const colors = [
    "#6366f1", // Indigo
    "#ec4899", // Pink
    "#14b8a6", // Teal
    "#f59e0b", // Amber
    "#22c55e", // Green
    "#3b82f6", // Blue
    "#8b5cf6", // Violet
    "#06b6d4", // Cyan
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Lighten a hex color for gradient effect
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}

function getRankBadge(rank: number) {
  if (rank === 1)
    return { bg: "bg-amber-500/20", text: "text-amber-400", label: "Top" };
  if (rank === 2)
    return { bg: "bg-slate-400/20", text: "text-slate-300", label: "2nd" };
  if (rank === 3)
    return { bg: "bg-orange-600/20", text: "text-orange-400", label: "3rd" };
  return { bg: "bg-[#252525]", text: "text-[#666]", label: `#${rank}` };
}

export default function CustomerCard({
  customer,
  rank,
  isDragging,
  isCopied,
  onDragStart,
  onDragOver,
  onDragEnd,
  onCopyLink,
  onViewIssues,
  onViewDetails,
}: CustomerCardProps) {
  const baseColor = customer.brandColor || stringToColor(customer.name);
  const gradientTo = lightenColor(baseColor, 20);
  const rankStyle = getRankBadge(rank);

  return (
    <div
      className={`flex-shrink-0 w-[260px] h-full flex flex-col bg-[#141414] border border-[#252525] rounded-lg overflow-hidden transition-all duration-200 ${
        isDragging ? "opacity-50 scale-[0.98]" : "hover:border-[#333]"
      }`}
      draggable
      onDragStart={(e) => onDragStart(e, customer)}
      onDragOver={(e) => onDragOver(e, customer)}
      onDragEnd={onDragEnd}
    >
      {/* Header with gradient banner */}
      <div
        className="h-16 relative"
        style={{
          background: `linear-gradient(135deg, ${baseColor} 0%, ${gradientTo} 100%)`,
        }}
      >
        {/* Drag handle */}
        <div className="absolute top-2 left-2 cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 transition-opacity">
          <svg
            className="w-4 h-4 text-white/80"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M4 4h2v2H4V4zm6 0h2v2h-2V4zM4 10h2v2H4v-2zm6 0h2v2h-2v-2z" />
          </svg>
        </div>

        {/* Rank badge */}
        <div
          className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-semibold ${rankStyle.bg} ${rankStyle.text}`}
        >
          {rankStyle.label}
        </div>

        {/* Avatar/Logo */}
        <div
          className="absolute -bottom-6 left-4 w-12 h-12 rounded-lg bg-[#1a1a1a] border-2 border-[#141414] flex items-center justify-center overflow-hidden shadow-lg"
          style={{
            background: customer.logoUrl
              ? "#1a1a1a"
              : `linear-gradient(135deg, ${baseColor} 0%, ${gradientTo} 100%)`,
          }}
        >
          {customer.logoUrl ? (
            <img
              src={customer.logoUrl}
              alt={customer.name}
              className="w-8 h-8 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.parentElement!.style.background = `linear-gradient(135deg, ${baseColor} 0%, ${gradientTo} 100%)`;
              }}
            />
          ) : (
            <span className="text-lg font-bold text-white">
              {customer.name[0].toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 pt-8 px-4 pb-4 flex flex-col">
        {/* Name */}
        <h3 className="text-[14px] font-semibold text-[#f5f5f5] mb-1 truncate">
          {customer.name}
        </h3>

        {/* Slug */}
        <span className="text-[11px] text-[#555] font-mono mb-3">
          /{customer.slug}
        </span>

        {/* Stats */}
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-[#555]"
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
            <span className="text-[12px] text-[#888]">
              <span className="text-[#f5f5f5] font-medium">
                {customer.issueCount}
              </span>{" "}
              issues
            </span>
          </div>
        </div>

        {/* Slack indicator */}
        {customer.slackChannelId && (
          <div className="flex items-center gap-1.5 mb-3 px-2 py-1 bg-[#1a1a1a] rounded text-[11px] text-[#888]">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
            Connected
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex gap-2">
            <button
              onClick={onViewIssues}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-[#888] bg-[#1a1a1a] hover:bg-[#222] hover:text-[#ccc] border border-[#252525] rounded-md transition-colors"
            >
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
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              Issues
            </button>
            <button
              onClick={() => onCopyLink(customer)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] border rounded-md transition-all ${
                isCopied
                  ? "bg-green-500/20 border-green-500/30 text-green-400"
                  : "text-[#888] bg-[#1a1a1a] hover:bg-[#222] hover:text-[#ccc] border-[#252525]"
              }`}
            >
              {isCopied ? (
                <>
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
                  Copied
                </>
              ) : (
                <>
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
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                  Portal
                </>
              )}
            </button>
          </div>
          {onViewDetails && (
            <button
              onClick={onViewDetails}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-[#5e6ad2] bg-[#5e6ad2]/10 hover:bg-[#5e6ad2]/20 border border-[#5e6ad2]/30 rounded-md transition-colors"
            >
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
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              View Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
