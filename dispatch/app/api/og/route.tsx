import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Priority colors matching the app
const PRIORITY_COLORS: Record<string, string> = {
  P1: "#f87171",
  P2: "#fb923c",
  P3: "#60a5fa",
  P4: "#6b7280",
};

// Status colors and display names
const STATUS_CONFIG: Record<
  string,
  { color: string; bgColor: string; label: string }
> = {
  backlog: {
    color: "#9ca3af",
    bgColor: "rgba(156, 163, 175, 0.15)",
    label: "Backlog",
  },
  triage: {
    color: "#a78bfa",
    bgColor: "rgba(167, 139, 250, 0.15)",
    label: "Triage",
  },
  todo: {
    color: "#60a5fa",
    bgColor: "rgba(96, 165, 250, 0.15)",
    label: "Todo",
  },
  in_progress: {
    color: "#fbbf24",
    bgColor: "rgba(251, 191, 36, 0.15)",
    label: "In Progress",
  },
  in_review: {
    color: "#34d399",
    bgColor: "rgba(52, 211, 153, 0.15)",
    label: "In Review",
  },
  done: { color: "#22c55e", bgColor: "rgba(34, 197, 94, 0.15)", label: "Done" },
  canceled: {
    color: "#ef4444",
    bgColor: "rgba(239, 68, 68, 0.15)",
    label: "Canceled",
  },
};

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3).trim() + "...";
}

export async function GET(request: NextRequest) {
  try {
    console.log("[OG] Request received:", request.url);

    const { searchParams } = new URL(request.url);

    // Get issue data from query params
    const title = searchParams.get("title") || "Chipp Issues";
    const description = searchParams.get("description") || "";
    const identifier = searchParams.get("id") || "";
    const status = searchParams.get("status")?.toLowerCase() || "";
    const priority = searchParams.get("priority") || "";
    const labelsParam = searchParams.get("labels") || "";
    const assignee = searchParams.get("assignee") || "";

    const labels = labelsParam ? labelsParam.split(",").slice(0, 4) : [];
    const isIssue = !!identifier;

    console.log("[OG] Fetching font from GCS...");

    // Load fonts from GCS (same as chipp-landing)
    const fontResponse = await fetch(
      "https://storage.googleapis.com/chipp-chat-widget-assets/Mulish-Regular.ttf"
    );

    if (!fontResponse.ok) {
      console.error(
        "[OG] Font fetch failed:",
        fontResponse.status,
        fontResponse.statusText
      );
      throw new Error(`Font fetch failed: ${fontResponse.status}`);
    }

    const mulishFontData = await fontResponse.arrayBuffer();
    console.log("[OG] Font loaded, size:", mulishFontData.byteLength);

    const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.backlog;
    const priorityColor = PRIORITY_COLORS[priority] || PRIORITY_COLORS.P3;

    // Truncate for display
    const displayTitle = truncateText(title, isIssue ? 80 : 50);
    const displayDescription = truncateText(description, 160);

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "column",
            background: "#0a0a0a",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle grid pattern */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: `
              linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)
            `,
              backgroundSize: "48px 48px",
            }}
          />

          {/* Top-left decorative gradient orb */}
          <div
            style={{
              position: "absolute",
              top: "-100px",
              left: "-100px",
              width: "400px",
              height: "400px",
              background:
                "radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)",
              borderRadius: "50%",
            }}
          />

          {/* Bottom-right decorative gradient orb */}
          <div
            style={{
              position: "absolute",
              bottom: "-150px",
              right: "-100px",
              width: "500px",
              height: "500px",
              background:
                "radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)",
              borderRadius: "50%",
            }}
          />

          {/* Main content */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "56px 64px",
              position: "relative",
              zIndex: 1,
            }}
          >
            {/* Header: Logo and branding */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "40px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "16px" }}
              >
                {/* Chipp logo mark */}
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background:
                      "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 32px rgba(139, 92, 246, 0.3)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "24px",
                      fontWeight: "bold",
                      color: "#fff",
                      fontFamily: "Mulish",
                    }}
                  >
                    C
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: "24px",
                      fontWeight: "bold",
                      color: "#f5f5f5",
                      fontFamily: "Mulish",
                      letterSpacing: "-0.5px",
                    }}
                  >
                    Chipp Issues
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      color: "#666",
                      fontFamily: "Mulish",
                    }}
                  >
                    AI-Native Issue Tracker
                  </span>
                </div>
              </div>

              {/* Issue identifier badge */}
              {isIssue && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 20px",
                    background: "rgba(255, 255, 255, 0.05)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: "bold",
                      color: "#8b5cf6",
                      fontFamily: "Mulish",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {identifier}
                  </span>
                </div>
              )}
            </div>

            {/* Issue card preview */}
            {isIssue ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  background: "rgba(20, 20, 20, 0.8)",
                  borderRadius: "20px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  padding: "40px 48px",
                  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.4)",
                }}
              >
                {/* Status and Priority row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    marginBottom: "24px",
                  }}
                >
                  {/* Priority bar */}
                  {priority && (
                    <div
                      style={{
                        width: "4px",
                        height: "32px",
                        borderRadius: "2px",
                        background: priorityColor,
                        boxShadow: `0 0 12px ${priorityColor}40`,
                      }}
                    />
                  )}

                  {/* Status badge */}
                  {status && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 16px",
                        background: statusConfig.bgColor,
                        borderRadius: "20px",
                        border: `1px solid ${statusConfig.color}30`,
                      }}
                    >
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: statusConfig.color,
                          boxShadow: `0 0 8px ${statusConfig.color}`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: "600",
                          color: statusConfig.color,
                          fontFamily: "Mulish",
                        }}
                      >
                        {statusConfig.label}
                      </span>
                    </div>
                  )}

                  {/* Assignee */}
                  {assignee && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginLeft: "auto",
                      }}
                    >
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background:
                            "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: "bold",
                            color: "#fff",
                            fontFamily: "Mulish",
                          }}
                        >
                          {assignee.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "14px",
                          color: "#888",
                          fontFamily: "Mulish",
                        }}
                      >
                        {assignee}
                      </span>
                    </div>
                  )}
                </div>

                {/* Title */}
                <div
                  style={{
                    fontSize: "44px",
                    fontWeight: "bold",
                    color: "#f5f5f5",
                    fontFamily: "Mulish",
                    lineHeight: 1.2,
                    marginBottom: "20px",
                    letterSpacing: "-1px",
                  }}
                >
                  {displayTitle}
                </div>

                {/* Description */}
                {displayDescription && (
                  <div
                    style={{
                      fontSize: "22px",
                      color: "#888",
                      fontFamily: "Mulish",
                      lineHeight: 1.5,
                      marginBottom: "auto",
                    }}
                  >
                    {displayDescription}
                  </div>
                )}

                {/* Labels */}
                {labels.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginTop: "24px",
                    }}
                  >
                    {labels.map((label, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "8px 14px",
                          background: "rgba(139, 92, 246, 0.15)",
                          borderRadius: "8px",
                          border: "1px solid rgba(139, 92, 246, 0.3)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "14px",
                            color: "#a78bfa",
                            fontFamily: "Mulish",
                            fontWeight: "500",
                          }}
                        >
                          {label.trim()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Fallback: Generic Chipp Issues branding */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  justifyContent: "center",
                }}
              >
                {/* Main headline */}
                <div
                  style={{
                    fontSize: "72px",
                    fontWeight: "bold",
                    color: "#f5f5f5",
                    fontFamily: "Mulish",
                    lineHeight: 1.1,
                    marginBottom: "24px",
                    letterSpacing: "-2px",
                  }}
                >
                  {displayTitle}
                </div>

                {displayDescription && (
                  <div
                    style={{
                      fontSize: "28px",
                      color: "#666",
                      fontFamily: "Mulish",
                      lineHeight: 1.5,
                      maxWidth: "800px",
                    }}
                  >
                    {displayDescription}
                  </div>
                )}

                {/* Feature highlights */}
                <div
                  style={{
                    display: "flex",
                    gap: "24px",
                    marginTop: "48px",
                  }}
                >
                  {[
                    { icon: "M", label: "MCP Protocol" },
                    { icon: "S", label: "Semantic Search" },
                    { icon: "R", label: "Real-time Activity" },
                  ].map((feature, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "14px 24px",
                        background: "rgba(255, 255, 255, 0.03)",
                        borderRadius: "12px",
                        border: "1px solid rgba(255, 255, 255, 0.06)",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background:
                            "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: "bold",
                            color: "#fff",
                            fontFamily: "Mulish",
                          }}
                        >
                          {feature.icon}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "16px",
                          color: "#888",
                          fontFamily: "Mulish",
                          fontWeight: "500",
                        }}
                      >
                        {feature.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "32px",
                paddingTop: "24px",
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  style={{
                    fontSize: "16px",
                    color: "#555",
                    fontFamily: "Mulish",
                  }}
                >
                  Built for AI coding agents
                </span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  style={{
                    fontSize: "16px",
                    color: "#444",
                    fontFamily: "Mulish",
                  }}
                >
                  issues.chipp.ai
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: "Mulish",
            data: mulishFontData,
            style: "normal",
            weight: 400,
          },
        ],
      }
    );
  } catch (error) {
    console.error("[OG] Error generating image:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to generate OG image",
        details: String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
