"use client";

import { useState, useEffect, useRef } from "react";

// Curated brand color palette
const BRAND_COLORS = [
  "#ef4444", // Red
  "#f97316", // Orange
  "#f59e0b", // Amber
  "#84cc16", // Lime
  "#22c55e", // Green
  "#14b8a6", // Teal
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#6366f1", // Indigo
  "#8b5cf6", // Violet
  "#a855f7", // Purple
  "#ec4899", // Pink
  "#f43f5e", // Rose
  "#64748b", // Slate
];

interface CreateCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    slackChannelId?: string;
    brandColor?: string;
    logoUrl?: string;
  }) => Promise<void>;
}

export default function CreateCustomerModal({
  isOpen,
  onClose,
  onSubmit,
}: CreateCustomerModalProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");
  const [brandColor, setBrandColor] = useState("#3b82f6");
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setSlackChannelId("");
      setBrandColor("#3b82f6");
      setLogoUrl("");
      setShowColorPicker(false);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        slackChannelId: slackChannelId.trim() || undefined,
        brandColor: brandColor || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  // Generate preview slug
  const previewSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    <div
      className="fixed inset-0 z-50 modal-backdrop flex items-start justify-center pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with brand color preview */}
        <div
          className="h-2 transition-colors duration-300"
          style={{ backgroundColor: brandColor }}
        />
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#252525]">
          <div className="flex items-center gap-3">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors duration-300"
              style={{ backgroundColor: brandColor }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="w-4 h-4 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <svg
                  className="w-3.5 h-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              )}
            </div>
            <span className="text-[13px] font-medium text-[#f5f5f5]">
              New Customer
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
          {/* Name */}
          <div className="px-5 pt-4 pb-3">
            <label className="block text-[11px] text-[#666] uppercase tracking-wide mb-1.5">
              Customer Name
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full px-3 py-2 text-[14px] text-[#f5f5f5] bg-[#141414] border border-[#333] rounded-md placeholder-[#555] outline-none focus:border-[#5e6ad2] transition-colors"
            />
            {name && (
              <p className="mt-1.5 text-[11px] text-[#555]">
                Portal URL:{" "}
                <span className="text-[#888] font-mono">
                  /portal/{previewSlug}
                </span>
              </p>
            )}
          </div>

          {/* Branding Section */}
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 mb-2">
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
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
              <span className="text-[11px] text-[#666] uppercase tracking-wide">
                Branding
              </span>
            </div>

            <div className="bg-[#141414] border border-[#333] rounded-lg p-3">
              {/* Brand Color */}
              <div className="mb-3">
                <label className="block text-[11px] text-[#555] mb-2">
                  Brand Color
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-8 h-8 rounded-lg border-2 border-[#333] hover:border-[#444] transition-colors flex-shrink-0"
                    style={{ backgroundColor: brandColor }}
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                        setBrandColor(val);
                      }
                    }}
                    className="flex-1 px-2 py-1.5 text-[12px] text-[#888] bg-[#1a1a1a] border border-[#333] rounded font-mono outline-none focus:border-[#5e6ad2]"
                    placeholder="#3b82f6"
                  />
                </div>

                {/* Color palette */}
                {showColorPicker && (
                  <div className="mt-2 p-2 bg-[#1a1a1a] border border-[#333] rounded-lg">
                    <div className="grid grid-cols-7 gap-1.5">
                      {BRAND_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            setBrandColor(color);
                            setShowColorPicker(false);
                          }}
                          className={`w-6 h-6 rounded-md transition-transform hover:scale-110 ${
                            brandColor === color
                              ? "ring-2 ring-white ring-offset-1 ring-offset-[#1a1a1a]"
                              : ""
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-[11px] text-[#555] mb-2">
                  Logo URL <span className="text-[#444]">(optional)</span>
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-2 py-1.5 text-[12px] text-[#888] bg-[#1a1a1a] border border-[#333] rounded outline-none focus:border-[#5e6ad2]"
                />
                <p className="mt-1 text-[10px] text-[#444]">
                  Square image recommended (PNG or SVG)
                </p>
              </div>
            </div>
          </div>

          {/* Slack Channel (optional) */}
          <div className="px-5 pb-4">
            <label className="block text-[11px] text-[#666] uppercase tracking-wide mb-1.5">
              Slack Channel ID{" "}
              <span className="text-[#444] normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={slackChannelId}
              onChange={(e) => setSlackChannelId(e.target.value)}
              placeholder="C0123456789"
              className="w-full px-3 py-2 text-[14px] text-[#f5f5f5] bg-[#141414] border border-[#333] rounded-md placeholder-[#555] outline-none focus:border-[#5e6ad2] transition-colors font-mono"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#252525]">
            <span className="text-[11px] text-[#555]">
              Portal branding will use these colors
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
                disabled={loading || !name.trim()}
                className="px-3 py-1.5 text-[12px] font-medium text-white rounded-md transition-colors disabled:bg-[#333] disabled:text-[#666]"
                style={{
                  backgroundColor:
                    loading || !name.trim() ? undefined : brandColor,
                }}
              >
                {loading ? "Creating..." : "Create Customer"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
