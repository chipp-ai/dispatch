/**
 * PWA API routes for consumer chat apps
 *
 * Provides:
 * - /consumer/:appNameId/manifest.json - Dynamic manifest with app branding
 * - /consumer/:appNameId/icon/:size - App icons at various sizes
 * - /consumer/:appNameId/splash/:dimensions - iOS splash screens
 */

import { Hono } from "hono";
import * as Sentry from "@sentry/deno";
import { cors } from "hono/cors";
import { resolveApp } from "../../middleware/consumerAuth.ts";

const pwaRoutes = new Hono();

// Enable CORS for PWA assets
pwaRoutes.use("*", cors());

/**
 * iOS splash screen sizes
 */
const iosSplashScreenSizes = [
  // iPhone 16 Pro Max (440x956 @ 3x)
  { width: 1320, height: 2868, deviceWidth: 440, deviceHeight: 956, ratio: 3 },
  // iPhone 15/16 Pro (402x874 @ 3x)
  { width: 1206, height: 2622, deviceWidth: 402, deviceHeight: 874, ratio: 3 },
  // iPhone 14 Pro Max, 15 Plus, 16 Plus (430x932 @ 3x)
  { width: 1290, height: 2796, deviceWidth: 430, deviceHeight: 932, ratio: 3 },
  // iPhone 14 Plus (428x926 @ 3x)
  { width: 1284, height: 2778, deviceWidth: 428, deviceHeight: 926, ratio: 3 },
  // iPhone 14 Pro, 15, 16 (393x852 @ 3x)
  { width: 1179, height: 2556, deviceWidth: 393, deviceHeight: 852, ratio: 3 },
  // iPhone 12/13/14 (390x844 @ 3x)
  { width: 1170, height: 2532, deviceWidth: 390, deviceHeight: 844, ratio: 3 },
  // iPhone 12/13 Mini, X, XS, 11 Pro (375x812 @ 3x)
  { width: 1125, height: 2436, deviceWidth: 375, deviceHeight: 812, ratio: 3 },
  // iPhone 11, XR (414x896 @ 2x)
  { width: 828, height: 1792, deviceWidth: 414, deviceHeight: 896, ratio: 2 },
  // iPhone SE, 8, 7, 6s, 6 (375x667 @ 2x)
  { width: 750, height: 1334, deviceWidth: 375, deviceHeight: 667, ratio: 2 },
  // iPad Pro 12.9" (1024x1366 @ 2x)
  {
    width: 2048,
    height: 2732,
    deviceWidth: 1024,
    deviceHeight: 1366,
    ratio: 2,
  },
  // iPad Pro 11" (834x1194 @ 2x)
  { width: 1668, height: 2388, deviceWidth: 834, deviceHeight: 1194, ratio: 2 },
] as const;

type SplashScreenSize = (typeof iosSplashScreenSizes)[number];

function getSplashScreenMediaQuery(size: SplashScreenSize): string {
  return `(device-width: ${size.deviceWidth}px) and (device-height: ${size.deviceHeight}px) and (-webkit-device-pixel-ratio: ${size.ratio})`;
}

/**
 * Check if text should be light on this background
 */
function shouldUseLightText(bgColor: string): boolean {
  const hex = bgColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

/**
 * Escape string for safe XML/SVG insertion (prevents XSS)
 */
function escapeForXML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validate and sanitize image URL to prevent XSS
 * Only allows http(s) URLs and safe base64 data URIs
 */
function sanitizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();

  // Allow http(s) URLs
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:") {
      return escapeForXML(trimmed);
    }
  } catch {
    // Not a valid URL, check for data URI
  }

  // Allow safe base64 image data URIs
  if (trimmed.startsWith("data:image/")) {
    if (
      /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(
        trimmed
      )
    ) {
      return escapeForXML(trimmed);
    }
  }

  return undefined;
}

/**
 * Check if a hostname is private/local (for SSRF protection)
 */
function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Block localhost and local domains
  if (
    lower === "localhost" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }

  // Block private IPv4 ranges
  const ipv4Match = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x, 169.254.x.x
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      return true;
    }
  }

  // Block IPv6 loopback and link-local
  if (
    lower === "::1" ||
    lower.startsWith("fe80:") ||
    lower.startsWith("fc00:")
  ) {
    return true;
  }

  return false;
}

/**
 * Validate URL for safe fetching (SSRF protection)
 */
function isAllowedFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    const port = parsed.port;

    // Only allow HTTP(S)
    if (protocol !== "https:" && protocol !== "http:") {
      return false;
    }

    // Only allow standard ports
    if (port && port !== "443" && port !== "80") {
      return false;
    }

    // Block private/local hosts
    if (isPrivateHost(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Generate fallback SVG icon with letter
 */
function generateFallbackSVG(
  size: number,
  primaryColor: string,
  appName: string,
  isMaskable: boolean = false
): string {
  const bgColor = isMaskable ? primaryColor : "white";
  const textColor = isMaskable ? "white" : primaryColor;
  const fontSize = size * 0.4;
  const safeLetter = escapeForXML(appName.charAt(0).toUpperCase());

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${bgColor}" />
    <text x="50%" y="50%" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="600" fill="${textColor}" text-anchor="middle" dominant-baseline="central">${safeLetter}</text>
  </svg>`;
}

/**
 * Generate simple splash screen SVG
 */
function generateSplashSVG(
  width: number,
  height: number,
  primaryColor: string,
  appName: string,
  logoUrl?: string
): string {
  const bgColor = shouldUseLightText(primaryColor) ? "#FFFFFF" : "#000000";
  const textColor = shouldUseLightText(primaryColor) ? "#000000" : "#FFFFFF";
  const logoSize = Math.min(width, height) * 0.2;
  const fontSize = Math.min(width, height) * 0.05;

  // Sanitize user inputs to prevent XSS
  const safeAppName = escapeForXML(appName);
  const safeInitial = escapeForXML(appName.charAt(0).toUpperCase());
  const sanitizedLogoUrl = sanitizeImageUrl(logoUrl);

  // If we have a valid logo URL, include it
  const logoElement = sanitizedLogoUrl
    ? `<image href="${sanitizedLogoUrl}" x="${(width - logoSize) / 2}" y="${(height - logoSize) / 2 - fontSize}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" />`
    : `<rect x="${(width - logoSize) / 2}" y="${(height - logoSize) / 2 - fontSize}" width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.15}" fill="${primaryColor}" />
       <text x="${width / 2}" y="${height / 2 - fontSize / 2}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${logoSize * 0.4}" font-weight="600" fill="white" text-anchor="middle" dominant-baseline="central">${safeInitial}</text>`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${bgColor}" />
    ${logoElement}
    <text x="${width / 2}" y="${height / 2 + logoSize / 2 + fontSize}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="500" fill="${textColor}" text-anchor="middle">${safeAppName}</text>
  </svg>`;
}

/**
 * GET /consumer/:appNameId/manifest.json
 * Returns a dynamic manifest with app-specific branding
 */
pwaRoutes.get("/:appNameId/manifest.json", async (c) => {
  const appNameId = c.req.param("appNameId");

  console.log("[pwa] Manifest request", { appNameId });

  try {
    // Get app by appNameId using local resolveApp
    const application = await resolveApp(appNameId);
    if (!application) {
      console.error("[pwa] Application not found for manifest", { appNameId });
      return c.json({ error: "Application not found" }, 404);
    }

    const primaryColor =
      (application.brandStyles as any)?.primaryColor || "#F9DB00";
    const backgroundColor = shouldUseLightText(primaryColor)
      ? "#FFFFFF"
      : "#000000";

    // Create a short name (12 chars max for iOS)
    const shortName = application.name
      ? application.name.length > 12
        ? application.name.substring(0, 11) + "…"
        : application.name
      : "Chipp";

    const baseUrl = `/consumer/${appNameId}`;

    const manifest = {
      name: application.name || "Chipp Chat",
      short_name: shortName,
      description: application.description || "AI-powered chat assistant",
      start_url: `/#/chat`,
      display: "standalone",
      background_color: backgroundColor,
      theme_color: primaryColor,
      orientation: "portrait-primary",
      icons: [
        {
          src: `${baseUrl}/pwa/icon/192`,
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: `${baseUrl}/pwa/icon/512`,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: `${baseUrl}/pwa/icon/192?maskable=true`,
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: `${baseUrl}/pwa/icon/512?maskable=true`,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
        // iOS specific sizes
        {
          src: `${baseUrl}/pwa/icon/180`,
          sizes: "180x180",
          type: "image/png",
        },
        {
          src: `${baseUrl}/pwa/icon/152`,
          sizes: "152x152",
          type: "image/png",
        },
        {
          src: `${baseUrl}/pwa/icon/167`,
          sizes: "167x167",
          type: "image/png",
        },
      ],
      shortcuts: [
        {
          name: "New Chat",
          short_name: "New Chat",
          description: "Start a new conversation",
          url: `/#/chat?newChat=true`,
          icons: [
            {
              src: `${baseUrl}/pwa/icon/96`,
              sizes: "96x96",
              type: "image/svg+xml",
            },
          ],
        },
      ],
      apple_touch_startup_images: iosSplashScreenSizes.map((size) => ({
        media: getSplashScreenMediaQuery(size),
        href: `${baseUrl}/pwa/splash/${size.width}x${size.height}`,
      })),
      categories: ["productivity", "utilities"],
      lang: application.language || "en",
      prefer_related_applications: false,
      related_applications: [],
    };

    console.log("[pwa] Manifest generated", {
      appNameId,
      applicationId: application.id,
      applicationName: application.name,
    });

    return c.json(manifest, {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[pwa] Error generating manifest", { error, appNameId });
    Sentry.captureException(error, {
      tags: { source: "consumer-pwa-api", feature: "manifest" },
      extra: { appNameId },
    });
    return c.json({ error: "Failed to generate manifest" }, 500);
  }
});

/**
 * GET /consumer/:appNameId/pwa/icon/:size
 * Returns app icon at specified size
 */
pwaRoutes.get("/:appNameId/pwa/icon/:size", async (c) => {
  const appNameId = c.req.param("appNameId");
  const sizeParam = c.req.param("size");
  const isMaskable = c.req.query("maskable") === "true";
  const size = parseInt(sizeParam, 10);

  if (isNaN(size) || size < 16 || size > 1024) {
    return c.json({ error: "Invalid size" }, 400);
  }

  try {
    const application = await resolveApp(appNameId);
    if (!application) {
      return c.json({ error: "Application not found" }, 404);
    }

    const primaryColor =
      (application.brandStyles as any)?.primaryColor || "#F9DB00";
    const logoUrl = (application.brandStyles as any)?.logoUrl;

    // If app has a logo, try to proxy it
    // SECURITY: Validate URL before fetching to prevent SSRF attacks
    if (logoUrl && !isMaskable && isAllowedFetchUrl(logoUrl)) {
      try {
        const response = await fetch(logoUrl, {
          redirect: "error", // Block redirects to prevent SSRF via redirect
        });
        if (response.ok) {
          const contentType =
            response.headers.get("content-type") || "image/png";
          // Ensure only image content is proxied
          if (!contentType.toLowerCase().startsWith("image/")) {
            console.warn("[pwa] Blocked non-image content from logo URL", {
              appNameId,
              contentType,
            });
          } else {
            const imageBuffer = await response.arrayBuffer();

            return new Response(imageBuffer, {
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=86400",
              },
            });
          }
        }
      } catch (e) {
        console.warn("[pwa] Failed to fetch logo, using fallback", {
          appNameId,
          logoUrl: logoUrl.substring(0, 100), // Don't log full URL for security
          error: e,
        });
      }
    } else if (logoUrl && !isMaskable) {
      console.warn("[pwa] Blocked unsafe logo URL", {
        appNameId,
        logoUrl: logoUrl.substring(0, 100),
      });
    }

    // Generate fallback SVG
    const svg = generateFallbackSVG(
      size,
      primaryColor,
      application.name || "App",
      isMaskable
    );

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[pwa] Error generating icon", { error, appNameId, size });
    Sentry.captureException(error, {
      tags: { source: "consumer-pwa-api", feature: "icon" },
      extra: { appNameId, size, isMaskable },
    });

    // Return basic fallback
    const fallbackSvg = generateFallbackSVG(size, "#F9DB00", "App", isMaskable);
    return new Response(fallbackSvg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=60",
      },
    });
  }
});

/**
 * GET /consumer/:appNameId/pwa/splash/:dimensions
 * Returns iOS splash screen at specified dimensions
 */
pwaRoutes.get("/:appNameId/pwa/splash/:dimensions", async (c) => {
  const appNameId = c.req.param("appNameId");
  const dimensions = c.req.param("dimensions");

  const [widthStr, heightStr] = dimensions.split("x");
  const width = parseInt(widthStr);
  const height = parseInt(heightStr);

  if (isNaN(width) || isNaN(height)) {
    return c.json({ error: "Invalid dimensions" }, 400);
  }

  try {
    const application = await resolveApp(appNameId);
    if (!application) {
      return c.json({ error: "Application not found" }, 404);
    }

    const primaryColor =
      (application.brandStyles as any)?.primaryColor || "#F9DB00";
    const logoUrl = (application.brandStyles as any)?.logoUrl;
    const appName = application.name || "App";

    // Check for pre-generated splash screens
    const preGeneratedUrls = (application.brandStyles as any)
      ?.splashScreenUrls as Record<string, string> | undefined;
    const splashUrl = preGeneratedUrls?.[dimensions];

    // SECURITY: Validate URL before fetching to prevent SSRF attacks
    if (splashUrl && isAllowedFetchUrl(splashUrl)) {
      try {
        const response = await fetch(splashUrl, {
          redirect: "error", // Block redirects to prevent SSRF via redirect
        });
        if (response.ok) {
          const imageBuffer = await response.arrayBuffer();
          return new Response(imageBuffer, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      } catch (e) {
        console.warn("[pwa] Failed to fetch pre-generated splash", {
          appNameId,
          dimensions,
        });
      }
    } else if (splashUrl) {
      console.warn("[pwa] Blocked unsafe splash URL", {
        appNameId,
        splashUrl: splashUrl.substring(0, 100),
      });
    }

    // Generate SVG splash screen
    const svg = generateSplashSVG(
      width,
      height,
      primaryColor,
      appName,
      logoUrl
    );

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[pwa] Error generating splash screen", {
      error,
      appNameId,
      dimensions,
    });
    Sentry.captureException(error, {
      tags: { source: "consumer-pwa-api", feature: "splash" },
      extra: { appNameId, dimensions },
    });

    // Return simple fallback
    const svg = generateSplashSVG(width, height, "#F9DB00", "App");
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-cache",
      },
    });
  }
});

export default pwaRoutes;
