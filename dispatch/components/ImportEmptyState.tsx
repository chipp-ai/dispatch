"use client";

import { useState, useRef, useEffect } from "react";

interface ImportSummary {
  totalIssues: number;
  imported?: number;
  skipped?: number;
  labelsCreated?: number;
  agentsCreated?: number;
  embeddingsGenerated?: number;
  labels?: string[];
  assignees?: string[];
  statusCounts?: Record<string, number>;
}

interface ImportResult {
  success: boolean;
  dryRun?: boolean;
  summary: ImportSummary;
  error?: string;
}

type ImportPhase =
  | "idle"
  | "parsing"
  | "analyzing"
  | "creating_labels"
  | "generating_embeddings"
  | "importing"
  | "complete"
  | "error";

const PHASE_MESSAGES: Record<ImportPhase, string> = {
  idle: "Ready to import",
  parsing: "Parsing CSV file...",
  analyzing: "Analyzing issue data...",
  creating_labels: "Creating labels and assignees...",
  generating_embeddings: "Generating semantic embeddings...",
  importing: "Importing issues to database...",
  complete: "Import complete!",
  error: "Import failed",
};

interface ImportEmptyStateProps {
  onImportComplete: () => void;
}

export default function ImportEmptyState({
  onImportComplete,
}: ImportEmptyStateProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [skipEmbeddings, setSkipEmbeddings] = useState(false);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ImportResult | null>(null);

  // Simulate progress during import
  useEffect(() => {
    if (
      phase === "idle" ||
      phase === "complete" ||
      phase === "error" ||
      phase === "parsing"
    ) {
      return;
    }

    const phaseProgress: Record<ImportPhase, number> = {
      idle: 0,
      parsing: 10,
      analyzing: 25,
      creating_labels: 40,
      generating_embeddings: 70,
      importing: 90,
      complete: 100,
      error: 0,
    };

    const targetProgress = phaseProgress[phase];
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= targetProgress) {
          clearInterval(interval);
          return prev;
        }
        return prev + Math.random() * 2;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [phase]);

  async function handlePreview() {
    if (!file) return;
    setPhase("parsing");
    setProgress(5);
    setError(null);
    setPreviewData(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("dryRun", "true");

    try {
      await new Promise((r) => setTimeout(r, 500));
      setPhase("analyzing");

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Preview failed");
        setPhase("error");
        return;
      }

      setPreviewData(data);
      setPhase("idle");
      setProgress(0);
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }

  async function handleImport() {
    if (!file) return;
    setPhase("parsing");
    setProgress(0);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("skipEmbeddings", String(skipEmbeddings));

    try {
      await new Promise((r) => setTimeout(r, 400));
      setPhase("analyzing");

      await new Promise((r) => setTimeout(r, 600));
      setPhase("creating_labels");

      await new Promise((r) => setTimeout(r, 500));
      if (!skipEmbeddings) {
        setPhase("generating_embeddings");
      }

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      setPhase("importing");
      await new Promise((r) => setTimeout(r, 300));

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.details || "Import failed");
        setPhase("error");
        return;
      }

      setResult(data);
      setProgress(100);
      setPhase("complete");

      // Trigger refresh after short delay
      setTimeout(() => {
        onImportComplete();
      }, 2000);
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewData(null);
      setResult(null);
      setError(null);
      setPhase("idle");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.name.endsWith(".csv")) {
      setFile(dropped);
      setPreviewData(null);
      setResult(null);
      setError(null);
      setPhase("idle");
    }
  }

  function resetImport() {
    setFile(null);
    setPreviewData(null);
    setResult(null);
    setError(null);
    setPhase("idle");
    setProgress(0);
  }

  const isProcessing =
    phase !== "idle" && phase !== "complete" && phase !== "error";

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Subtle background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #fff 1px, transparent 1px),
            linear-gradient(to bottom, #fff 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Floating decorative elements */}
      <div className="absolute top-20 left-20 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl animate-pulse" />
      <div
        className="absolute bottom-20 right-20 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: "1s" }}
      />

      <div className="relative z-10 w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/20">
            <svg
              className="w-8 h-8 text-violet-400"
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
          <h2 className="text-2xl font-semibold text-[#f5f5f5] mb-2 tracking-tight">
            No issues yet
          </h2>
          <p className="text-[#666] text-[14px] max-w-md mx-auto">
            Import your existing issues from Linear to get started, or create
            your first issue manually.
          </p>
        </div>

        {/* Main content area */}
        {phase === "complete" && result ? (
          <CompleteState result={result} />
        ) : phase === "error" ? (
          <ErrorState error={error} onRetry={resetImport} />
        ) : isProcessing ? (
          <ProcessingState phase={phase} progress={progress} />
        ) : (
          <>
            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
              className={`
                relative overflow-hidden rounded-xl border-2 border-dashed p-8 text-center
                transition-all duration-300 cursor-pointer group
                ${
                  isDragging
                    ? "border-violet-500 bg-violet-500/10 scale-[1.02]"
                    : file
                      ? "border-[#333] bg-[#141414]"
                      : "border-[#252525] hover:border-[#333] hover:bg-[#141414]"
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Shimmer effect on hover */}
              <div
                className={`
                absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent
                -translate-x-full group-hover:translate-x-full transition-transform duration-1000
                ${file ? "hidden" : ""}
              `}
              />

              {file ? (
                <div className="relative space-y-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1f1f1f] border border-[#333]">
                    <FileIcon className="w-6 h-6 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-[#f5f5f5] font-medium text-[15px]">
                      {file.name}
                    </p>
                    <p className="text-[#555] text-[12px] mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      resetImport();
                    }}
                    className="text-[12px] text-[#666] hover:text-[#888] transition-colors"
                  >
                    Choose different file
                  </button>
                </div>
              ) : (
                <div className="relative space-y-3">
                  <div
                    className={`
                    inline-flex items-center justify-center w-12 h-12 rounded-xl
                    transition-all duration-300
                    ${isDragging ? "bg-violet-500/20 border-violet-500/30" : "bg-[#1a1a1a] border-[#252525]"}
                    border
                  `}
                  >
                    <UploadIcon
                      className={`w-6 h-6 transition-colors ${isDragging ? "text-violet-400" : "text-[#555]"}`}
                    />
                  </div>
                  <div>
                    <p className="text-[#888] text-[14px]">
                      Drop a CSV file here or{" "}
                      <span className="text-violet-400">browse</span>
                    </p>
                    <p className="text-[#444] text-[12px] mt-1">
                      Export from Linear: Settings → Import/Export → Export CSV
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Preview data */}
            {previewData && (
              <div className="mt-4 p-4 bg-[#141414] rounded-xl border border-[#252525] animate-fadeIn">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[12px] font-medium text-amber-400 uppercase tracking-wider">
                    Preview
                  </span>
                  <span className="text-[#666] text-[12px]">
                    {previewData.summary.totalIssues} issues found
                  </span>
                </div>

                {previewData.summary.statusCounts && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {Object.entries(previewData.summary.statusCounts).map(
                      ([status, count]) => (
                        <span
                          key={status}
                          className="px-2 py-1 bg-[#1f1f1f] rounded-md text-[11px] text-[#888] border border-[#252525]"
                        >
                          {status}: <span className="text-[#ccc]">{count}</span>
                        </span>
                      )
                    )}
                  </div>
                )}

                {previewData.summary.labels &&
                  previewData.summary.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {previewData.summary.labels.slice(0, 8).map((label) => (
                        <span
                          key={label}
                          className="px-1.5 py-0.5 bg-violet-500/10 text-violet-400 rounded text-[10px] border border-violet-500/20"
                        >
                          {label}
                        </span>
                      ))}
                      {previewData.summary.labels.length > 8 && (
                        <span className="px-1.5 py-0.5 text-[#555] text-[10px]">
                          +{previewData.summary.labels.length - 8} more
                        </span>
                      )}
                    </div>
                  )}
              </div>
            )}

            {/* Options and actions */}
            {file && (
              <div className="mt-6 space-y-4 animate-fadeIn">
                <label className="flex items-center gap-2.5 text-[13px] text-[#666] cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={skipEmbeddings}
                      onChange={(e) => setSkipEmbeddings(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-4 h-4 rounded border border-[#333] bg-[#1a1a1a] peer-checked:bg-violet-500 peer-checked:border-violet-500 transition-all" />
                    <svg
                      className="absolute top-0.5 left-0.5 w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <span className="group-hover:text-[#888] transition-colors">
                    Skip embeddings{" "}
                    <span className="text-[#444]">
                      (faster, disables semantic search)
                    </span>
                  </span>
                </label>

                <div className="flex gap-3">
                  <button
                    onClick={handlePreview}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 text-[13px] font-medium text-[#888] bg-[#1a1a1a] hover:bg-[#222] border border-[#333] hover:border-[#444] rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Preview
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 text-[13px] font-medium text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
                  >
                    Import Issues
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Or create manually */}
        {!file && !isProcessing && phase !== "complete" && (
          <div className="mt-8 text-center">
            <span className="text-[#444] text-[12px]">or</span>
            <p className="mt-2 text-[#666] text-[13px]">
              Press{" "}
              <kbd className="px-1.5 py-0.5 bg-[#1a1a1a] border border-[#333] rounded text-[11px] text-[#888] font-mono">
                C
              </kbd>{" "}
              to create your first issue
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessingState({
  phase,
  progress,
}: {
  phase: ImportPhase;
  progress: number;
}) {
  return (
    <div className="text-center py-8 animate-fadeIn">
      {/* Animated loader */}
      <div className="relative w-24 h-24 mx-auto mb-6">
        {/* Outer ring */}
        <svg className="w-24 h-24 transform -rotate-90">
          <circle
            cx="48"
            cy="48"
            r="44"
            stroke="#1f1f1f"
            strokeWidth="4"
            fill="none"
          />
          <circle
            cx="48"
            cy="48"
            r="44"
            stroke="url(#progressGradient)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${progress * 2.76} 276`}
            className="transition-all duration-300 ease-out"
          />
          <defs>
            <linearGradient
              id="progressGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>

        {/* Inner pulsing dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-violet-500 animate-pulse shadow-lg shadow-violet-500/50" />
        </div>
      </div>

      {/* Progress percentage */}
      <div className="text-3xl font-light text-[#f5f5f5] mb-2 tabular-nums">
        {Math.round(progress)}%
      </div>

      {/* Phase message */}
      <div className="text-[#666] text-[14px]">{PHASE_MESSAGES[phase]}</div>

      {/* Phase indicators */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {(
          [
            "parsing",
            "analyzing",
            "creating_labels",
            "generating_embeddings",
            "importing",
          ] as const
        ).map((p, i) => {
          const phases: ImportPhase[] = [
            "parsing",
            "analyzing",
            "creating_labels",
            "generating_embeddings",
            "importing",
          ];
          const currentIdx = phases.indexOf(phase);
          const thisIdx = phases.indexOf(p);
          const isComplete = thisIdx < currentIdx;
          const isCurrent = p === phase;

          return (
            <div
              key={p}
              className={`
                w-2 h-2 rounded-full transition-all duration-300
                ${isComplete ? "bg-violet-500" : isCurrent ? "bg-violet-500 animate-pulse" : "bg-[#333]"}
              `}
              style={{ animationDelay: `${i * 100}ms` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function CompleteState({ result }: { result: ImportResult }) {
  return (
    <div className="text-center py-8 animate-fadeIn">
      {/* Success icon */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      </div>

      <h3 className="text-xl font-semibold text-[#f5f5f5] mb-2">
        Import Complete!
      </h3>
      <p className="text-[#666] text-[14px] mb-6">
        Successfully imported {result.summary.imported} issues
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 text-left">
        <StatCard
          label="Imported"
          value={result.summary.imported || 0}
          color="emerald"
        />
        <StatCard
          label="Skipped"
          value={result.summary.skipped || 0}
          color="gray"
        />
        <StatCard
          label="Labels"
          value={result.summary.labelsCreated || 0}
          color="violet"
        />
        <StatCard
          label="Embeddings"
          value={result.summary.embeddingsGenerated || 0}
          color="blue"
        />
      </div>

      <p className="text-[#444] text-[12px] mt-6">
        Refreshing board automatically...
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "emerald" | "gray" | "violet" | "blue";
}) {
  const colors = {
    emerald: "text-emerald-400",
    gray: "text-[#888]",
    violet: "text-violet-400",
    blue: "text-blue-400",
  };

  return (
    <div className="p-3 bg-[#141414] rounded-lg border border-[#252525]">
      <p className="text-[#555] text-[11px] uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-2xl font-light ${colors[color]} mt-0.5`}>{value}</p>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="text-center py-8 animate-fadeIn">
      {/* Error icon */}
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-500/20 to-rose-600/20 border border-red-500/30 flex items-center justify-center">
        <svg
          className="w-10 h-10 text-red-400"
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

      <h3 className="text-xl font-semibold text-[#f5f5f5] mb-2">
        Import Failed
      </h3>

      {/* Error message box */}
      <div className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-left">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
            <span className="text-red-400 text-[11px] font-bold">!</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-red-400 text-[13px] font-medium mb-1">
              Error Details
            </p>
            <p className="text-red-300/70 text-[12px] break-words">
              {error || "An unknown error occurred"}
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onRetry}
        className="mt-6 px-6 py-2.5 text-[13px] font-medium text-white
          bg-[#1f1f1f] hover:bg-[#252525] border border-[#333] hover:border-[#444]
          rounded-lg transition-all"
      >
        Try Again
      </button>
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
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
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
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
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
