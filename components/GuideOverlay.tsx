"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface GuideOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    title: "Your Agent Command Center",
    description:
      "Dispatch sends autonomous agents to investigate, implement, test, and research. Every mission is backed by a real Claude Code session running in GitHub Actions.",
    illustration: FleetIllustration,
  },
  {
    title: "Dispatch a Mission",
    description:
      "Type in the terminal to dispatch investigation or research agents. Describe what you want built or explored, and an agent gets to work immediately.",
    illustration: SpawnIllustration,
  },
  {
    title: "Review & Approve Plans",
    description:
      "Investigation agents post plans for your approval. Approve to auto-dispatch an implementation agent, or request changes to refine the approach.",
    illustration: PlanIllustration,
  },
  {
    title: "Monitor the Fleet",
    description:
      "The Fleet panel shows running agents, daily costs, and budget usage. Cancel running agents, retry failed ones, or dispatch QA agents to verify implementations.",
    illustration: MonitorIllustration,
  },
  {
    title: "Deep Research",
    description:
      "Research agents search the internet and codebase to produce comprehensive reports. Use them for architecture decisions, technology comparisons, or exploring unfamiliar domains.",
    illustration: OutcomeIllustration,
  },
];

const STORAGE_KEY = "dispatch_guide_completed";

export function markGuideComplete() {
  localStorage.setItem(STORAGE_KEY, "true");
}

export function hasSeenGuide(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export default function GuideOverlay({ isOpen, onClose }: GuideOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    markGuideComplete();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setCurrentStep((s) => Math.max(s - 1, 0));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const Illustration = step.illustration;
  const isLast = currentStep === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-2xl bg-[#141414] border border-[#252525] rounded-xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <span className="text-[12px] text-[#666] font-medium">
            Step {currentStep + 1} of {STEPS.length}
          </span>
          <button
            onClick={handleClose}
            className="p-1 text-[#666] hover:text-[#ccc] rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Illustration */}
        <div className="px-6 pt-5 pb-2 flex justify-center">
          <div className="w-full h-[180px] rounded-lg bg-[#0d0d0d] border border-[#1f1f1f] flex items-center justify-center overflow-hidden">
            <Illustration />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-4 pb-2">
          <h2 className="text-[18px] font-semibold text-[#f5f5f5] mb-2">{step.title}</h2>
          <p className="text-[14px] text-[#999] leading-relaxed">{step.description}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-5">
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentStep ? "bg-[#5e6ad2]" : "bg-[#333] hover:bg-[#555]"
                }`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep((s) => s - 1)}
                className="px-3 py-1.5 text-[13px] text-[#888] hover:text-[#ccc] hover:bg-[#1f1f1f] rounded-md transition-colors"
              >
                Back
              </button>
            )}
            {isLast ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/guide"
                  onClick={handleClose}
                  className="text-[12px] text-[#666] hover:text-[#999] underline underline-offset-2 transition-colors"
                >
                  Read the full documentation
                </Link>
                <button
                  onClick={handleClose}
                  className="px-4 py-1.5 text-[13px] font-medium text-white bg-[#5e6ad2] hover:bg-[#6c78e0] rounded-md transition-colors"
                >
                  Get Started
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCurrentStep((s) => s + 1)}
                className="px-3 py-1.5 text-[13px] font-medium text-[#f5f5f5] bg-[#1f1f1f] hover:bg-[#2a2a2a] border border-[#333] rounded-md transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Step Illustrations ---

function FleetIllustration() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-full" fill="none">
      {/* Board columns */}
      <rect x="30" y="20" width="80" height="120" rx="6" fill="#1a1a1a" stroke="#252525" />
      <rect x="120" y="20" width="80" height="120" rx="6" fill="#1a1a1a" stroke="#252525" />
      <rect x="210" y="20" width="80" height="120" rx="6" fill="#1a1a1a" stroke="#252525" />
      <rect x="300" y="20" width="80" height="120" rx="6" fill="#1a1a1a" stroke="#252525" />

      {/* Column headers */}
      <rect x="38" y="28" width="32" height="4" rx="2" fill="#555" />
      <rect x="128" y="28" width="40" height="4" rx="2" fill="#555" />
      <rect x="218" y="28" width="28" height="4" rx="2" fill="#555" />
      <rect x="308" y="28" width="36" height="4" rx="2" fill="#555" />

      {/* Cards in columns */}
      <rect x="38" y="42" width="64" height="24" rx="4" fill="#222" stroke="#333" strokeWidth="0.5" />
      <rect x="38" y="72" width="64" height="24" rx="4" fill="#222" stroke="#333" strokeWidth="0.5" />

      <rect x="128" y="42" width="64" height="24" rx="4" fill="#222" stroke="#5e6ad240" strokeWidth="0.5" />
      <rect x="128" y="72" width="64" height="24" rx="4" fill="#222" stroke="#333" strokeWidth="0.5" />
      <rect x="128" y="102" width="64" height="24" rx="4" fill="#222" stroke="#333" strokeWidth="0.5" />

      <rect x="218" y="42" width="64" height="24" rx="4" fill="#222" stroke="#eab30840" strokeWidth="0.5" />

      <rect x="308" y="42" width="64" height="24" rx="4" fill="#222" stroke="#4ade8040" strokeWidth="0.5" />
      <rect x="308" y="72" width="64" height="24" rx="4" fill="#222" stroke="#4ade8040" strokeWidth="0.5" />

      {/* Card text lines */}
      <rect x="44" y="49" width="36" height="3" rx="1.5" fill="#666" />
      <rect x="44" y="55" width="24" height="2" rx="1" fill="#444" />
      <rect x="44" y="79" width="28" height="3" rx="1.5" fill="#666" />
      <rect x="44" y="85" width="40" height="2" rx="1" fill="#444" />

      {/* Agent status dots */}
      <circle cx="184" cy="50" r="3" fill="#5e6ad2">
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="274" cy="50" r="3" fill="#eab308">
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" begin="0.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="364" cy="50" r="3" fill="#4ade80" />
    </svg>
  );
}

function SpawnIllustration() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-full" fill="none">
      {/* Issue card */}
      <rect x="40" y="25" width="160" height="110" rx="8" fill="#1a1a1a" stroke="#252525" />
      <rect x="54" y="40" width="80" height="5" rx="2.5" fill="#888" />
      <rect x="54" y="52" width="120" height="3" rx="1.5" fill="#555" />
      <rect x="54" y="60" width="100" height="3" rx="1.5" fill="#555" />
      <rect x="54" y="68" width="110" height="3" rx="1.5" fill="#555" />

      {/* Investigate button */}
      <rect x="54" y="90" width="90" height="28" rx="6" fill="#5e6ad2" />
      <text x="75" y="108" fill="white" fontSize="11" fontFamily="system-ui" fontWeight="500">
        Investigate
      </text>

      {/* Arrow */}
      <line x1="220" y1="80" x2="260" y2="80" stroke="#5e6ad2" strokeWidth="1.5" strokeDasharray="4 3">
        <animate attributeName="stroke-dashoffset" values="0;-7" dur="1s" repeatCount="indefinite" />
      </line>
      <polygon points="260,75 270,80 260,85" fill="#5e6ad2" />

      {/* Agent */}
      <rect x="280" y="35" width="90" height="90" rx="8" fill="#1a1a1a" stroke="#5e6ad240" />
      <circle cx="325" cy="65" r="14" fill="#5e6ad215" stroke="#5e6ad2" strokeWidth="1">
        <animate attributeName="r" values="14;16;14" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x="319" y="70" fill="#5e6ad2" fontSize="14" fontFamily="system-ui" fontWeight="600">
        A
      </text>
      <rect x="298" y="92" width="54" height="3" rx="1.5" fill="#555" />
      <rect x="305" y="100" width="40" height="3" rx="1.5" fill="#444" />
    </svg>
  );
}

function PlanIllustration() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-full" fill="none">
      {/* Plan document */}
      <rect x="100" y="15" width="200" height="130" rx="8" fill="#1a1a1a" stroke="#252525" />

      {/* Plan header */}
      <rect x="120" y="30" width="60" height="5" rx="2.5" fill="#eab308" opacity="0.7" />

      {/* Plan lines */}
      <rect x="120" y="46" width="160" height="3" rx="1.5" fill="#555" />
      <rect x="120" y="55" width="140" height="3" rx="1.5" fill="#555" />
      <rect x="120" y="64" width="150" height="3" rx="1.5" fill="#555" />

      {/* Checklist items */}
      <rect x="120" y="80" width="8" height="8" rx="2" fill="none" stroke="#4ade80" strokeWidth="1" />
      <rect x="134" y="82" width="80" height="3" rx="1.5" fill="#666" />
      <rect x="120" y="96" width="8" height="8" rx="2" fill="none" stroke="#4ade80" strokeWidth="1" />
      <rect x="134" y="98" width="100" height="3" rx="1.5" fill="#666" />
      <rect x="120" y="112" width="8" height="8" rx="2" fill="none" stroke="#555" strokeWidth="1" />
      <rect x="134" y="114" width="60" height="3" rx="1.5" fill="#666" />

      {/* Checkmarks */}
      <path d="M122 84 L124 86 L127 82" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M122 100 L124 102 L127 98" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Approve button */}
      <rect x="245" y="108" width="40" height="18" rx="4" fill="#4ade8020" stroke="#4ade8060" strokeWidth="0.5" />
      <text x="249" y="121" fill="#4ade80" fontSize="9" fontFamily="system-ui" fontWeight="500">
        Approve
      </text>
    </svg>
  );
}

function MonitorIllustration() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-full" fill="none">
      {/* Fleet panel */}
      <rect x="20" y="15" width="130" height="130" rx="8" fill="#1a1a1a" stroke="#252525" />
      <rect x="34" y="28" width="40" height="4" rx="2" fill="#666" />

      {/* Budget bar */}
      <rect x="34" y="42" width="100" height="6" rx="3" fill="#222" />
      <rect x="34" y="42" width="65" height="6" rx="3" fill="#5e6ad2" opacity="0.7" />

      {/* Active agents */}
      <rect x="34" y="60" width="100" height="22" rx="4" fill="#222" stroke="#333" strokeWidth="0.5" />
      <circle cx="46" cy="71" r="4" fill="#5e6ad230" stroke="#5e6ad2" strokeWidth="0.5" />
      <rect x="56" y="67" width="50" height="3" rx="1.5" fill="#888" />
      <rect x="56" y="74" width="30" height="2" rx="1" fill="#555" />

      <rect x="34" y="88" width="100" height="22" rx="4" fill="#222" stroke="#333" strokeWidth="0.5" />
      <circle cx="46" cy="99" r="4" fill="#eab30830" stroke="#eab308" strokeWidth="0.5" />
      <rect x="56" y="95" width="40" height="3" rx="1.5" fill="#888" />
      <rect x="56" y="102" width="35" height="2" rx="1" fill="#555" />

      {/* Running indicator */}
      <circle cx="128" cy="71" r="3" fill="#5e6ad2">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
      </circle>

      {/* Action buttons */}
      <rect x="180" y="40" width="180" height="36" rx="6" fill="#1a1a1a" stroke="#252525" />
      <rect x="196" y="52" width="50" height="16" rx="4" fill="#ef444420" stroke="#ef444450" strokeWidth="0.5" />
      <text x="207" y="64" fill="#ef4444" fontSize="8" fontFamily="system-ui">Cancel</text>
      <rect x="256" y="52" width="40" height="16" rx="4" fill="#5e6ad220" stroke="#5e6ad250" strokeWidth="0.5" />
      <text x="264" y="64" fill="#5e6ad2" fontSize="8" fontFamily="system-ui">Retry</text>

      {/* Log output */}
      <rect x="180" y="90" width="180" height="50" rx="6" fill="#0d0d0d" stroke="#1f1f1f" />
      <rect x="192" y="102" width="120" height="3" rx="1.5" fill="#4ade8040" />
      <rect x="192" y="110" width="100" height="3" rx="1.5" fill="#4ade8030" />
      <rect x="192" y="118" width="140" height="3" rx="1.5" fill="#4ade8020" />
      <rect x="192" y="126" width="80" height="3" rx="1.5" fill="#5e6ad230" />
    </svg>
  );
}

function OutcomeIllustration() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-full" fill="none">
      {/* Outcome cards */}
      <rect x="30" y="30" width="100" height="100" rx="8" fill="#1a1a1a" stroke="#4ade8040" />
      <circle cx="80" cy="62" r="12" fill="#4ade8015" stroke="#4ade80" strokeWidth="1" />
      <path d="M74 62 L78 66 L86 58" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="50" y="84" width="60" height="4" rx="2" fill="#4ade80" opacity="0.5" />
      <text x="52" y="104" fill="#888" fontSize="8" fontFamily="system-ui">Completed</text>

      <rect x="150" y="30" width="100" height="100" rx="8" fill="#1a1a1a" stroke="#eab30840" />
      <circle cx="200" cy="62" r="12" fill="#eab30815" stroke="#eab308" strokeWidth="1" />
      <rect x="195" y="57" width="2" height="7" rx="1" fill="#eab308" />
      <circle cx="196" cy="68" r="1.5" fill="#eab308" />
      <rect x="170" y="84" width="60" height="4" rx="2" fill="#eab308" opacity="0.5" />
      <text x="178" y="104" fill="#888" fontSize="8" fontFamily="system-ui">Blocked</text>

      <rect x="270" y="30" width="100" height="100" rx="8" fill="#1a1a1a" stroke="#5e6ad240" />
      <circle cx="320" cy="62" r="12" fill="#5e6ad215" stroke="#5e6ad2" strokeWidth="1" />
      <line x1="314" y1="62" x2="326" y2="62" stroke="#5e6ad2" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="290" y="84" width="60" height="4" rx="2" fill="#5e6ad2" opacity="0.5" />
      <text x="284" y="104" fill="#888" fontSize="8" fontFamily="system-ui">No Changes</text>
    </svg>
  );
}
