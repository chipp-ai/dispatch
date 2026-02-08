"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status: { name: string; color: string };
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=10`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setSelectedIndex(0);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      router.push(`/issue/${results[selectedIndex].identifier}`);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 modal-backdrop flex items-start justify-center pt-[5vh] md:pt-[15vh] px-3 md:px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl overflow-hidden animate-fade-in max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#252525]">
          <SearchIcon className="w-4 h-4 text-[#666]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search issues..."
            className="flex-1 bg-transparent text-[14px] text-[#f5f5f5] placeholder-[#666] outline-none"
          />
          {loading && <div className="spinner" />}
          <kbd className="text-[10px] text-[#555] bg-[#252525] px-1.5 py-0.5 rounded">
            esc
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto py-2">
            {results.map((issue, index) => (
              <button
                key={issue.id}
                onClick={() => {
                  router.push(`/issue/${issue.identifier}`);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  index === selectedIndex ? "bg-[#252525]" : "hover:bg-[#222]"
                }`}
              >
                <StatusDot color={issue.status.color} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#666] font-mono">
                      {issue.identifier}
                    </span>
                    <span className="text-[13px] text-[#f5f5f5] truncate">
                      {issue.title}
                    </span>
                  </div>
                </div>
                <PriorityIndicator priority={issue.priority} />
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query && !loading && results.length === 0 && (
          <div className="py-8 text-center text-[13px] text-[#666]">
            No issues found
          </div>
        )}

        {/* Help text */}
        {!query && (
          <div className="py-8 text-center text-[13px] text-[#555]">
            Start typing to search issues
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#252525] text-[11px] text-[#555]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd>↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd>↵</kbd> Open
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd>esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <div
      className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
      style={{ borderColor: color }}
    />
  );
}

function PriorityIndicator({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    P1: "#f87171",
    P2: "#fb923c",
    P3: "#60a5fa",
    P4: "#4b5563",
  };

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4].map((level) => (
        <div
          key={level}
          className="w-0.5 rounded-sm"
          style={{
            height: `${6 + level * 2}px`,
            backgroundColor:
              parseInt(priority.slice(1)) <= level ? colors[priority] : "#333",
          }}
        />
      ))}
    </div>
  );
}
