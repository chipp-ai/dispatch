import { ImageResponse } from "next/og";
import { db } from "@/lib/db";

// Use Node.js runtime for postgres compatibility
export const runtime = "nodejs";

interface IssueRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status_name: string;
  status_color: string;
  customer_name: string | null;
  customer_brand_color: string | null;
  customer_logo_url: string | null;
  reporter_name: string | null;
  reporter_avatar_url: string | null;
  created_at: Date;
}

const priorityConfig: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  P1: { label: "Urgent", color: "#ef4444", icon: "!" },
  P2: { label: "High", color: "#f97316", icon: "!!" },
  P3: { label: "Normal", color: "#eab308", icon: "-" },
  P4: { label: "Low", color: "#22c55e", icon: "..." },
};

// Convert hex to RGB components for rgba() usage
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 99, g: 102, b: 241 }; // fallback indigo
}

// Determine if text should be light or dark based on background
function shouldUseLightText(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// Lighten a hex color
function lightenColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const lighten = (c: number) =>
    Math.min(255, Math.floor(c + (255 - c) * (percent / 100)));
  return `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`;
}

// Darken a hex color
function darkenColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const darken = (c: number) =>
    Math.max(0, Math.floor(c * (1 - percent / 100)));
  return `rgb(${darken(r)}, ${darken(g)}, ${darken(b)})`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ identifier: string }> }
) {
  const { identifier } = await params;

  try {
    const issue = await db.queryOne<IssueRow>(
      `SELECT i.id, i.identifier, i.title, i.description, i.priority, i.created_at,
              s.name as status_name, s.color as status_color,
              c.name as customer_name,
              c.brand_color as customer_brand_color,
              c.logo_url as customer_logo_url,
              u.slack_display_name as reporter_name,
              u.slack_avatar_url as reporter_avatar_url
       FROM chipp_issue i
       JOIN chipp_status s ON i.status_id = s.id
       LEFT JOIN chipp_customer c ON i.customer_id = c.id
       LEFT JOIN chipp_customer_user u ON i.reporter_id = u.id
       WHERE i.identifier = $1`,
      [identifier.toUpperCase()]
    );

    if (!issue) {
      return new Response("Issue not found", { status: 404 });
    }

    const priority = priorityConfig[issue.priority] || priorityConfig.P3;
    const truncatedDescription = issue.description
      ? issue.description.length > 100
        ? `${issue.description.substring(0, 100).trim()}...`
        : issue.description
      : null;

    // Customer branding - use their color or fallback to a refined slate
    const brandColor = issue.customer_brand_color || "#6366f1";
    const { r, g, b } = hexToRgb(brandColor);
    const brandRgb = `${r}, ${g}, ${b}`;
    const customerInitial = issue.customer_name?.[0]?.toUpperCase() || "C";

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "column",
            background: "#09090b",
            fontFamily: "system-ui, -apple-system, sans-serif",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Atmospheric brand gradient - subtle but present */}
          <div
            style={{
              position: "absolute",
              top: "-200px",
              right: "-100px",
              width: "600px",
              height: "600px",
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${brandRgb}, 0.15) 0%, transparent 70%)`,
              filter: "blur(60px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "-150px",
              left: "-100px",
              width: "500px",
              height: "500px",
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${brandRgb}, 0.08) 0%, transparent 70%)`,
              filter: "blur(80px)",
            }}
          />

          {/* Top accent bar - bold brand statement */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "5px",
              background: `linear-gradient(90deg, ${brandColor}, ${lightenColor(brandColor, 30)}, ${brandColor})`,
            }}
          />

          {/* Content container */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "48px 56px",
              position: "relative",
            }}
          >
            {/* Header: Customer branding + Issue ID */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "32px",
              }}
            >
              {/* Customer identity - prominent placement */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "16px" }}
              >
                {/* Customer logo or branded initial */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "56px",
                    height: "56px",
                    borderRadius: "14px",
                    background: issue.customer_logo_url
                      ? "#18181b"
                      : `linear-gradient(135deg, ${brandColor}, ${darkenColor(brandColor, 20)})`,
                    border: `2px solid rgba(${brandRgb}, 0.3)`,
                    boxShadow: `0 0 24px rgba(${brandRgb}, 0.2)`,
                    overflow: "hidden",
                  }}
                >
                  {issue.customer_logo_url ? (
                    <img
                      src={issue.customer_logo_url}
                      alt=""
                      width={36}
                      height={36}
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <span
                      style={{
                        color: shouldUseLightText(brandColor) ? "#fff" : "#000",
                        fontSize: "26px",
                        fontWeight: 700,
                      }}
                    >
                      {customerInitial}
                    </span>
                  )}
                </div>

                {/* Customer name with brand accent */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <span
                    style={{
                      color: brandColor,
                      fontSize: "14px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {issue.customer_name || "Issue Tracker"}
                  </span>
                  <span style={{ color: "#52525b", fontSize: "13px" }}>
                    Support Request
                  </span>
                </div>
              </div>

              {/* Issue identifier - pill with brand accent */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 20px",
                  background: `rgba(${brandRgb}, 0.1)`,
                  borderRadius: "10px",
                  border: `1px solid rgba(${brandRgb}, 0.25)`,
                }}
              >
                <span
                  style={{
                    color: brandColor,
                    fontSize: "22px",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {issue.identifier}
                </span>
              </div>
            </div>

            {/* Main content area */}
            <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
              {/* Issue title - the hero */}
              <h1
                style={{
                  color: "#fafafa",
                  fontSize: "48px",
                  fontWeight: 700,
                  lineHeight: 1.15,
                  margin: 0,
                  marginBottom: "20px",
                  letterSpacing: "-0.02em",
                }}
              >
                {issue.title.length > 80
                  ? `${issue.title.substring(0, 80).trim()}...`
                  : issue.title}
              </h1>

              {/* Description preview */}
              {truncatedDescription && (
                <p
                  style={{
                    color: "#a1a1aa",
                    fontSize: "22px",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {truncatedDescription}
                </p>
              )}
            </div>

            {/* Footer: Status badges + reporter */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "24px",
                borderTop: "1px solid #27272a",
              }}
            >
              <div style={{ display: "flex", gap: "12px" }}>
                {/* Status badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 18px",
                    background: "#18181b",
                    borderRadius: "10px",
                    border: "1px solid #27272a",
                  }}
                >
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      background: issue.status_color,
                      boxShadow: `0 0 10px ${issue.status_color}80`,
                    }}
                  />
                  <span
                    style={{
                      color: "#e4e4e7",
                      fontSize: "18px",
                      fontWeight: 500,
                    }}
                  >
                    {issue.status_name}
                  </span>
                </div>

                {/* Priority badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 18px",
                    background: `${priority.color}15`,
                    borderRadius: "10px",
                    border: `1px solid ${priority.color}30`,
                  }}
                >
                  <span
                    style={{
                      color: priority.color,
                      fontSize: "18px",
                      fontWeight: 600,
                    }}
                  >
                    {priority.label}
                  </span>
                </div>
              </div>

              {/* Reporter info */}
              {issue.reporter_name && (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  {issue.reporter_avatar_url ? (
                    <img
                      src={issue.reporter_avatar_url}
                      alt=""
                      width={36}
                      height={36}
                      style={{
                        borderRadius: "50%",
                        border: `2px solid rgba(${brandRgb}, 0.3)`,
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${brandColor}, ${darkenColor(brandColor, 30)})`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: `2px solid rgba(${brandRgb}, 0.3)`,
                      }}
                    >
                      <span
                        style={{
                          color: shouldUseLightText(brandColor)
                            ? "#fff"
                            : "#000",
                          fontSize: "14px",
                          fontWeight: 600,
                        }}
                      >
                        {issue.reporter_name[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span style={{ color: "#a1a1aa", fontSize: "16px" }}>
                    {issue.reporter_name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom brand reinforcement line */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: `linear-gradient(90deg, transparent, rgba(${brandRgb}, 0.5), transparent)`,
            }}
          />
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error("Error generating OG image:", error);
    return new Response("Error generating image", { status: 500 });
  }
}
