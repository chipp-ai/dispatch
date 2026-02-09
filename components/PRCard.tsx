"use client";

interface PRCardProps {
  pr: {
    id: string;
    pr_number: number;
    pr_url: string;
    pr_title: string;
    pr_status: "open" | "merged" | "closed";
    branch_name: string | null;
    author: string | null;
    base_branch: string | null;
    ai_summary: string | null;
    match_confidence: number | null;
    created_at: string;
  };
  onUnlink?: (prId: string) => void;
}

const statusConfig = {
  open: {
    label: "Open",
    color: "#4ade80",
    bgColor: "#4ade8015",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
        <path
          fillRule="evenodd"
          d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"
        />
      </svg>
    ),
  },
  merged: {
    label: "Merged",
    color: "#a78bfa",
    bgColor: "#a78bfa15",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M5 3.254V3.25v.005a.75.75 0 110-.005v.004zm.45 1.9a2.25 2.25 0 10-1.95.218v5.256a2.25 2.25 0 101.5 0V7.123A5.735 5.735 0 009.25 9h1.378a2.251 2.251 0 100-1.5H9.25a4.25 4.25 0 01-3.8-2.346zM12.75 9a.75.75 0 100-1.5.75.75 0 000 1.5zm-8.5 4.5a.75.75 0 100-1.5.75.75 0 000 1.5z"
        />
      </svg>
    ),
  },
  closed: {
    label: "Closed",
    color: "#f87171",
    bgColor: "#f8717115",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M11.28 3.22a.75.75 0 010 1.06L6.56 9l4.72 4.72a.75.75 0 11-1.06 1.06L4.94 9.53a.75.75 0 010-1.06l5.28-5.28a.75.75 0 011.06 0z"
        />
      </svg>
    ),
  },
};

export default function PRCard({ pr, onUnlink }: PRCardProps) {
  const status = statusConfig[pr.pr_status];

  return (
    <div className="bg-[#141414] border border-[#252525] rounded-lg p-3 hover:border-[#303030] transition-colors">
      {/* Header with PR number and status */}
      <div className="flex items-center justify-between mb-2">
        <a
          href={pr.pr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[12px] font-mono text-[#5e6ad2] hover:text-[#7b83dc] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"
            />
          </svg>
          #{pr.pr_number}
        </a>
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ backgroundColor: status.bgColor, color: status.color }}
        >
          {status.icon}
          {status.label}
        </div>
      </div>

      {/* PR Title */}
      <a
        href={pr.pr_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[13px] text-[#e0e0e0] hover:text-white leading-snug mb-2 line-clamp-2"
      >
        {pr.pr_title}
      </a>

      {/* AI Summary if available */}
      {pr.ai_summary && (
        <div className="text-[11px] text-[#707070] mb-2 italic">
          {pr.ai_summary}
        </div>
      )}

      {/* Metadata row */}
      <div className="flex items-center gap-3 text-[11px] text-[#505050]">
        {/* Author */}
        {pr.author && (
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2z" />
            </svg>
            {pr.author}
          </div>
        )}

        {/* Branch */}
        {pr.branch_name && (
          <div className="flex items-center gap-1 truncate max-w-[120px]">
            <svg
              className="w-3 h-3 flex-shrink-0"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"
              />
            </svg>
            <span className="truncate font-mono">{pr.branch_name}</span>
          </div>
        )}

        {/* Target branch */}
        {pr.base_branch && (
          <div className="flex items-center gap-1 text-[#404040]">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 8h4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M8 6l2 2-2 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {pr.base_branch}
          </div>
        )}
      </div>

      {/* Confidence badge if high confidence match */}
      {pr.match_confidence !== null && pr.match_confidence >= 0.85 && (
        <div className="mt-2 pt-2 border-t border-[#1f1f1f] flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#4ade80]" />
          <span className="text-[10px] text-[#606060]">
            {Math.round(pr.match_confidence * 100)}% match confidence
          </span>
        </div>
      )}

      {/* Unlink button */}
      {onUnlink && (
        <button
          onClick={() => onUnlink(pr.id)}
          className="mt-2 flex items-center gap-1 text-[11px] text-[#505050] hover:text-[#f87171] transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Unlink PR
        </button>
      )}
    </div>
  );
}
