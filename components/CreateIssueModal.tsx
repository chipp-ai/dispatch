"use client";

import { useState, useEffect, useRef } from "react";

interface Status {
  id: string;
  name: string;
  color: string;
}

interface Label {
  id: string;
  name: string;
  color: string;
}

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    priority: string;
    statusId: string;
    labelIds: string[];
    assigneeName: string;
  }) => void;
  statuses: Status[];
  labels: Label[];
}

export default function CreateIssueModal({
  isOpen,
  onClose,
  onSubmit,
  statuses,
  labels,
}: CreateIssueModalProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("P3");
  const [statusId, setStatusId] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [assigneeName, setAssigneeName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setPriority("P3");
      setStatusId(statuses[0]?.id || "");
      setSelectedLabels([]);
      setAssigneeName("");
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [isOpen, statuses]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        priority,
        statusId,
        labelIds: selectedLabels,
        assigneeName: assigneeName.trim(),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function toggleLabel(labelId: string) {
    setSelectedLabels((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 modal-backdrop flex items-end md:items-start justify-center md:pt-[10vh] p-0 md:px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#1a1a1a] border border-[#333] rounded-t-xl md:rounded-xl shadow-2xl overflow-hidden animate-fade-in max-h-[90vh] md:max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#252525]">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
              C
            </div>
            <span className="text-[13px] font-medium text-[#f5f5f5]">
              New Issue
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#666] hover:text-[#888] transition-colors"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="px-5 pt-4">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              className="w-full text-[16px] font-medium text-[#f5f5f5] bg-transparent placeholder-[#555] outline-none"
            />
          </div>

          {/* Description */}
          <div className="px-5 py-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description..."
              rows={4}
              className="w-full text-[13px] text-[#888] bg-transparent placeholder-[#555] outline-none resize-none"
            />
          </div>

          {/* Properties */}
          <div className="px-5 py-3 border-t border-[#252525] space-y-3">
            {/* Status & Priority row */}
            <div className="flex items-center gap-4">
              <PropertySelect
                label="Status"
                value={statusId}
                onChange={setStatusId}
                options={statuses.map((s) => ({
                  value: s.id,
                  label: s.name,
                  color: s.color,
                }))}
                icon={<StatusIcon />}
              />
              <PropertySelect
                label="Priority"
                value={priority}
                onChange={setPriority}
                options={[
                  { value: "P1", label: "Urgent", color: "#f87171" },
                  { value: "P2", label: "High", color: "#fb923c" },
                  { value: "P3", label: "Normal", color: "#60a5fa" },
                  { value: "P4", label: "Low", color: "#4b5563" },
                ]}
                icon={<PriorityIcon />}
              />
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-2">
              <AssigneeIcon />
              <input
                type="text"
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                placeholder="Assignee"
                className="flex-1 text-[13px] text-[#888] bg-transparent placeholder-[#555] outline-none"
              />
            </div>

            {/* Labels */}
            {labels.length > 0 && (
              <div className="pt-1">
                <div className="flex items-center gap-2 mb-2">
                  <LabelIcon />
                  <span className="text-[12px] text-[#666]">Labels</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((label) => (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => toggleLabel(label.id)}
                      className={`px-2 py-0.5 text-[11px] rounded border transition-all ${
                        selectedLabels.includes(label.id)
                          ? "border-current opacity-100"
                          : "border-transparent opacity-50 hover:opacity-80"
                      }`}
                      style={{
                        backgroundColor: `${label.color}15`,
                        color: label.color,
                      }}
                    >
                      {label.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#252525]">
            <span className="text-[11px] text-[#555]">
              Press <kbd className="mx-0.5">Enter</kbd> to create
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-[12px] text-[#888] hover:text-[#ccc] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !title.trim()}
                className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#5e6ad2] hover:bg-[#6b74db] disabled:bg-[#333] disabled:text-[#666] rounded-md transition-colors"
              >
                {loading ? "Creating..." : "Create Issue"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

interface PropertySelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; color?: string }[];
  icon: React.ReactNode;
}

function PropertySelect({
  label,
  value,
  onChange,
  options,
  icon,
}: PropertySelectProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[#666]">{icon}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-[13px] bg-transparent text-[#888] outline-none cursor-pointer hover:text-[#ccc] transition-colors appearance-none"
        style={{ color: selected?.color }}
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className="bg-[#1a1a1a] text-[#f5f5f5]"
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PriorityIcon() {
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
        d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
      />
    </svg>
  );
}

function AssigneeIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-[#666]"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function LabelIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-[#666]"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  );
}
