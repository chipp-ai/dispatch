/**
 * Builder Dashboard PWA Routes (Public - No Auth Required)
 *
 * Provides dynamic PWA assets for the builder dashboard:
 * - /api/pwa/manifest.json - Dynamic manifest with whitelabel support
 * - /api/pwa/icon/:size - Dashboard icon at various sizes
 * - /api/pwa/splash/:dimensions - iOS splash screens with grid + gradient atmosphere
 *
 * These routes are PUBLIC because browsers fetch manifest/icons without cookies.
 * Whitelabel branding is resolved by hostname (custom domain lookup).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { log } from "@/lib/logger.ts";
import { db } from "../../../db/client.ts";

const builderPwaRoutes = new Hono();

// Enable CORS for PWA assets
builderPwaRoutes.use("*", cors());

// ========================================
// iOS Splash Screen Sizes
// ========================================

const iosSplashScreenSizes = [
  { width: 1320, height: 2868, deviceWidth: 440, deviceHeight: 956, ratio: 3 },
  { width: 1206, height: 2622, deviceWidth: 402, deviceHeight: 874, ratio: 3 },
  { width: 1290, height: 2796, deviceWidth: 430, deviceHeight: 932, ratio: 3 },
  { width: 1284, height: 2778, deviceWidth: 428, deviceHeight: 926, ratio: 3 },
  { width: 1179, height: 2556, deviceWidth: 393, deviceHeight: 852, ratio: 3 },
  { width: 1170, height: 2532, deviceWidth: 390, deviceHeight: 844, ratio: 3 },
  { width: 1125, height: 2436, deviceWidth: 375, deviceHeight: 812, ratio: 3 },
  { width: 828, height: 1792, deviceWidth: 414, deviceHeight: 896, ratio: 2 },
  { width: 750, height: 1334, deviceWidth: 375, deviceHeight: 667, ratio: 2 },
  { width: 2048, height: 2732, deviceWidth: 1024, deviceHeight: 1366, ratio: 2 },
  { width: 1668, height: 2388, deviceWidth: 834, deviceHeight: 1194, ratio: 2 },
] as const;

type SplashScreenSize = (typeof iosSplashScreenSizes)[number];

function getSplashScreenMediaQuery(size: SplashScreenSize): string {
  return `(device-width: ${size.deviceWidth}px) and (device-height: ${size.deviceHeight}px) and (-webkit-device-pixel-ratio: ${size.ratio})`;
}

// ========================================
// Utility Functions
// ========================================

function escapeForXML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:") {
      return escapeForXML(trimmed);
    }
  } catch {
    // Not a valid URL
  }
  return undefined;
}

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  const ipv4Match = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return true;
  }
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc00:")) return true;
  return false;
}

function isAllowedFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") return false;
    if (parsed.port && parsed.port !== "443" && parsed.port !== "80") return false;
    if (isPrivateHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine if a color should use a dark background.
 * Hue-aware: warm colors (yellow/orange) get lower threshold.
 */
function shouldUseDarkBackground(hex: string): boolean {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / d + 2) * 60;
    else hue = ((r - g) / d + 4) * 60;
  }

  const threshold = hue >= 25 && hue <= 65 ? 0.35 : 0.5;
  return luminance > threshold;
}

// ========================================
// Whitelabel Resolution (by hostname)
// ========================================

interface BrandConfig {
  name: string;
  primaryColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

const DEFAULT_BRAND: BrandConfig = {
  name: "Chipp",
  primaryColor: "#F9DB00",
  logoUrl: null,
  faviconUrl: null,
};

/**
 * Resolve whitelabel branding from request hostname.
 * Returns default Chipp branding if no whitelabel tenant matches.
 */
async function resolveBrand(hostname: string): Promise<BrandConfig> {
  // Skip whitelabel lookup for Chipp domains and localhost
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".chipp.ai") ||
    hostname === "127.0.0.1"
  ) {
    return DEFAULT_BRAND;
  }

  try {
    const tenant = await db
      .selectFrom("app.whitelabel_tenants")
      .select(["name", "primaryColor", "logoUrl", "faviconUrl"])
      .where("customDomain", "=", hostname)
      .executeTakeFirst();

    if (tenant) {
      return {
        name: tenant.name,
        primaryColor: tenant.primaryColor || DEFAULT_BRAND.primaryColor,
        logoUrl: tenant.logoUrl,
        faviconUrl: tenant.faviconUrl,
      };
    }
  } catch (e) {
    log.warn("Failed to resolve whitelabel tenant", { source: "builder-pwa", feature: "resolve-brand", hostname, error: String(e) });
  }

  return DEFAULT_BRAND;
}

// ========================================
// SVG Generators
// ========================================

function generateIconSVG(size: number, primaryColor: string, name: string, isMaskable: boolean): string {
  const bgColor = isMaskable ? primaryColor : "white";
  const textColor = isMaskable ? "white" : primaryColor;
  const fontSize = size * 0.4;
  const safeLetter = escapeForXML(name.charAt(0).toUpperCase());

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${bgColor}" />
    <text x="50%" y="50%" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="600" fill="${textColor}" text-anchor="middle" dominant-baseline="central">${safeLetter}</text>
  </svg>`;
}

function generateSplashSVG(
  width: number,
  height: number,
  primaryColor: string,
  name: string,
  logoUrl?: string | null,
): string {
  const useDarkBg = shouldUseDarkBackground(primaryColor);
  const bgColor = useDarkBg ? "#0A0A0A" : "#FFFFFF";
  const gridStroke = useDarkBg ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";
  const logoSize = Math.min(width, height) * 0.3;
  const logoRadius = logoSize * 0.2;

  const safeInitial = escapeForXML(name.charAt(0).toUpperCase());
  const sanitizedLogoUrl = sanitizeImageUrl(logoUrl);

  const logoX = (width - logoSize) / 2;
  const logoY = (height - logoSize) / 2;

  const clipId = "logoClip";
  const logoElement = sanitizedLogoUrl
    ? `<defs>
        <clipPath id="${clipId}">
          <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="${logoRadius}" />
        </clipPath>
      </defs>
      <image href="${sanitizedLogoUrl}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})" />`
    : `<rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="${logoRadius}" fill="${primaryColor}" />
       <text x="${width / 2}" y="${logoY + logoSize / 2}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${logoSize * 0.4}" font-weight="600" fill="white" text-anchor="middle" dominant-baseline="central">${safeInitial}</text>`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${bgColor}" />
    <defs>
      <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
        <path d="M 60 0 L 0 0 0 60" fill="none" stroke="${gridStroke}" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#grid)" opacity="0.75"/>
    <defs>
      <radialGradient id="blGrad" cx="0%" cy="100%" r="65%">
        <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.352"/>
        <stop offset="20%" stop-color="${primaryColor}" stop-opacity="0.307"/>
        <stop offset="30%" stop-color="${primaryColor}" stop-opacity="0.201"/>
        <stop offset="45%" stop-color="${primaryColor}" stop-opacity="0.106"/>
        <stop offset="70%" stop-color="${primaryColor}" stop-opacity="0.008"/>
        <stop offset="80%" stop-color="${primaryColor}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#blGrad)" />
    <defs>
      <radialGradient id="trGrad" cx="100%" cy="0%" r="75%">
        <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.462"/>
        <stop offset="20%" stop-color="${primaryColor}" stop-opacity="0.347"/>
        <stop offset="40%" stop-color="${primaryColor}" stop-opacity="0.231"/>
        <stop offset="60%" stop-color="${primaryColor}" stop-opacity="0.116"/>
        <stop offset="80%" stop-color="${primaryColor}" stop-opacity="0.058"/>
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#trGrad)" />
    ${logoElement}
  </svg>`;
}

// ========================================
// Routes
// ========================================

/**
 * GET /api/pwa/manifest.json
 * Dynamic manifest for the builder dashboard with whitelabel support.
 */
builderPwaRoutes.get("/manifest.json", async (c) => {
  const host = new URL(c.req.url).hostname;
  const brand = await resolveBrand(host);

  const useDarkBg = shouldUseDarkBackground(brand.primaryColor);
  const backgroundColor = useDarkBg ? "#0A0A0A" : "#FFFFFF";

  const shortName = brand.name.length > 12
    ? brand.name.substring(0, 11) + "\u2026"
    : brand.name;

  const manifest = {
    name: brand.name,
    short_name: shortName,
    description: `${brand.name} - AI App Builder`,
    start_url: "/",
    display: "standalone" as const,
    background_color: backgroundColor,
    theme_color: brand.primaryColor,
    orientation: "any" as const,
    icons: [
      { src: "/api/pwa/icon/192", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/api/pwa/icon/512", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/api/pwa/icon/192?maskable=true", sizes: "192x192", type: "image/svg+xml", purpose: "maskable" },
      { src: "/api/pwa/icon/512?maskable=true", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
      { src: "/api/pwa/icon/180", sizes: "180x180", type: "image/svg+xml" },
      { src: "/api/pwa/icon/152", sizes: "152x152", type: "image/svg+xml" },
      { src: "/api/pwa/icon/167", sizes: "167x167", type: "image/svg+xml" },
    ],
    shortcuts: [
      {
        name: "My Apps",
        short_name: "Apps",
        description: "View your apps",
        url: "/#/apps",
        icons: [{ src: "/api/pwa/icon/96", sizes: "96x96", type: "image/svg+xml" }],
      },
    ],
    apple_touch_startup_images: iosSplashScreenSizes.map((size) => ({
      media: getSplashScreenMediaQuery(size),
      href: `/api/pwa/splash/${size.width}x${size.height}`,
    })),
    categories: ["productivity", "developer-tools"],
    prefer_related_applications: false,
  };

  return c.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
});

/**
 * GET /api/pwa/icon/:size
 * Builder dashboard icon at the specified size.
 */
builderPwaRoutes.get("/icon/:size", async (c) => {
  const sizeParam = c.req.param("size");
  const isMaskable = c.req.query("maskable") === "true";
  const size = parseInt(sizeParam, 10);

  if (isNaN(size) || size < 16 || size > 1024) {
    return c.json({ error: "Invalid size" }, 400);
  }

  const host = new URL(c.req.url).hostname;
  const brand = await resolveBrand(host);

  // If whitelabel has a logo, try to proxy it
  if (brand.logoUrl && !isMaskable && isAllowedFetchUrl(brand.logoUrl)) {
    try {
      const response = await fetch(brand.logoUrl, { redirect: "error" });
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "image/png";
        if (contentType.toLowerCase().startsWith("image/")) {
          const imageBuffer = await response.arrayBuffer();
          return new Response(imageBuffer, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      }
    } catch {
      // Fall through to SVG generation
    }
  }

  // For default Chipp (no whitelabel), serve the chippylogo
  if (!brand.logoUrl && brand.name === "Chipp" && !isMaskable) {
    // Redirect to static asset for default Chipp icon
    return c.redirect("/assets/chippylogo.svg", 302);
  }

  // Generate SVG fallback
  const svg = generateIconSVG(size, brand.primaryColor, brand.name, isMaskable);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

/**
 * GET /api/pwa/splash/:dimensions
 * iOS splash screen with grid lines and gradient atmosphere.
 */
builderPwaRoutes.get("/splash/:dimensions", async (c) => {
  const dimensions = c.req.param("dimensions");
  const [widthStr, heightStr] = dimensions.split("x");
  const width = parseInt(widthStr);
  const height = parseInt(heightStr);

  if (isNaN(width) || isNaN(height) || width < 100 || height < 100 || width > 4096 || height > 4096) {
    return c.json({ error: "Invalid dimensions" }, 400);
  }

  const host = new URL(c.req.url).hostname;
  const brand = await resolveBrand(host);

  const svg = generateSplashSVG(width, height, brand.primaryColor, brand.name, brand.logoUrl);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

export { builderPwaRoutes };
