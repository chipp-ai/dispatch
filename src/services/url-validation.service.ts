/**
 * URL Validation Service
 *
 * Validates URLs to prevent SSRF attacks.
 * Only allows HTTPS URLs (except localhost in development).
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate a URL for SSRF prevention
 */
export async function validateUrl(url: string): Promise<ValidationResult> {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS (or HTTP for localhost in development)
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.startsWith("192.168.") ||
      parsed.hostname.startsWith("10.") ||
      parsed.hostname.endsWith(".local");

    const isDevelopment = Deno.env.get("ENVIRONMENT") !== "production";

    if (!isLocalhost && parsed.protocol !== "https:") {
      return {
        isValid: false,
        error: "Only HTTPS URLs are allowed (except localhost in development)",
      };
    }

    // Block localhost HTTP in production (HTTPS localhost is allowed)
    if (
      !isDevelopment &&
      parsed.protocol !== "https:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return {
        isValid: false,
        error: "Localhost URLs not allowed in production",
      };
    }

    // Block private IP ranges (even if they somehow get through)
    if (
      parsed.hostname.match(/^10\./) ||
      parsed.hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./) ||
      parsed.hostname.match(/^192\.168\./)
    ) {
      if (!isDevelopment) {
        return {
          isValid: false,
          error: "Private IP addresses not allowed",
        };
      }
    }

    return { isValid: true };
  } catch {
    return {
      isValid: false,
      error: "Invalid URL format",
    };
  }
}

