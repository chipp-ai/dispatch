/**
 * Test Action Endpoint
 *
 * Executes a custom action with provided parameters for testing purposes.
 * Acts as a proxy to make the actual HTTP request and return the response.
 */

import { log } from "@/lib/logger.ts";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthContext } from "../../middleware/auth.ts";
import { sql } from "../../../db/client.ts";
import { applicationVariableService } from "../../../services/application-variable.service.ts";

/**
 * Check if an IP address is in a private/internal range
 * Prevents SSRF attacks by blocking requests to internal networks
 */
function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  const ipv4PrivateRanges = [
    /^127\./, // Loopback
    /^10\./, // Class A private
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
    /^192\.168\./, // Class C private
    /^169\.254\./, // Link-local (including cloud metadata services)
    /^0\./, // Current network
    /^224\./, // Multicast
    /^255\./, // Broadcast
  ];

  // IPv6 private/special ranges
  const ipv6PrivateRanges = [
    /^::1$/, // Loopback
    /^fe80:/i, // Link-local
    /^fc00:/i, // Unique local
    /^fd00:/i, // Unique local
    /^::ffff:127\./i, // IPv4-mapped loopback
    /^::ffff:10\./i, // IPv4-mapped private
    /^::ffff:172\.(1[6-9]|2[0-9]|3[0-1])\./i, // IPv4-mapped private
    /^::ffff:192\.168\./i, // IPv4-mapped private
    /^::ffff:169\.254\./i, // IPv4-mapped link-local
  ];

  return (
    ipv4PrivateRanges.some((regex) => regex.test(ip)) ||
    ipv6PrivateRanges.some((regex) => regex.test(ip))
  );
}

/**
 * Validate URL is safe for SSRF (not targeting internal resources)
 * Performs DNS resolution to prevent DNS rebinding attacks
 */
async function validateUrlForSSRF(
  urlString: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const url = new URL(urlString);

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(url.protocol)) {
      return {
        valid: false,
        error: "Only HTTP and HTTPS protocols are allowed",
      };
    }

    // Block common internal hostnames
    const blockedHostnames = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "[::1]",
      "metadata.google.internal",
      "metadata.goog",
      "kubernetes.default",
      "kubernetes.default.svc",
    ];

    if (blockedHostnames.includes(url.hostname.toLowerCase())) {
      return {
        valid: false,
        error: "Requests to internal hosts are not allowed",
      };
    }

    // Block IP addresses that are in private ranges
    // This catches direct IP access like http://10.0.0.1/
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipRegex.test(url.hostname)) {
      if (isPrivateIP(url.hostname)) {
        return {
          valid: false,
          error: "Requests to private IP addresses are not allowed",
        };
      }
    }

    // For hostnames, resolve DNS and check if they point to private IPs
    // This prevents DNS rebinding attacks where a hostname initially resolves
    // to a public IP but later resolves to a private/internal IP
    const hostname = url.hostname.toLowerCase();

    // Skip DNS check for direct IP addresses (already checked above)
    if (!ipRegex.test(hostname)) {
      try {
        // Resolve IPv4 addresses
        const ipv4Addresses = await Deno.resolveDns(hostname, "A");
        for (const ip of ipv4Addresses) {
          if (isPrivateIP(ip)) {
            return {
              valid: false,
              error: `Hostname resolves to private IP address (${ip})`,
            };
          }
        }

        // Also check IPv6 addresses
        try {
          const ipv6Addresses = await Deno.resolveDns(hostname, "AAAA");
          for (const ip of ipv6Addresses) {
            if (isPrivateIP(ip)) {
              return {
                valid: false,
                error: `Hostname resolves to private IPv6 address`,
              };
            }
          }
        } catch {
          // No AAAA records is fine, continue
        }
      } catch (dnsError) {
        // DNS resolution failed - could be invalid hostname or network issue
        // For security, we reject requests to unresolvable hostnames
        // as they might be attempting to bypass checks
        const errorMessage =
          dnsError instanceof Error
            ? dnsError.message
            : "DNS resolution failed";

        // Allow common DNS errors like NXDOMAIN through as "not found"
        if (
          errorMessage.includes("NXDOMAIN") ||
          errorMessage.includes("no such host")
        ) {
          return {
            valid: false,
            error: "Hostname not found",
          };
        }

        // For other DNS errors, log and allow (network issues shouldn't block)
        log.warn("DNS resolution warning during SSRF check", {
          source: "test-action",
          feature: "ssrf-validation",
          hostname,
          errorMessage,
        });
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

export const testActionRoutes = new Hono<AuthContext>();

// Schema for key-value parameters
const paramSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  sampleValue: z.string().optional(),
  isAIGenerated: z.boolean().optional(),
  valueSource: z
    .enum(["STATIC", "AI_GENERATED", "SYSTEM_VARIABLE", "VARIABLE"])
    .optional(),
  variableName: z.string().optional(),
});

const testActionSchema = z.object({
  url: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  headers: z.array(paramSchema).optional().default([]),
  queryParams: z.array(paramSchema).optional().default([]),
  bodyParams: z.array(paramSchema).optional().default([]),
  pathParams: z.array(paramSchema).optional().default([]),
});

/**
 * Substitute path parameters in URL
 * Replaces {{paramName}} with the actual value
 */
function substitutePathParams(
  url: string,
  pathParams: Record<string, string>
): string {
  return url.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, varName) => {
    const replacement = pathParams[varName];
    if (replacement === undefined || replacement === null) return "";
    return encodeURIComponent(String(replacement));
  });
}

/**
 * Build parameter object from array of key-value pairs
 * Resolves variable references and uses sample values for AI-generated params
 */
async function buildParamObject(
  params: z.infer<typeof paramSchema>[],
  applicationId: string | null,
  variableCache: Map<string, string>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const param of params) {
    if (!param.key.trim()) continue;

    let value = "";

    // Determine value based on source
    if (param.valueSource === "VARIABLE" && param.variableName) {
      // Look up variable value
      if (variableCache.has(param.variableName)) {
        value = variableCache.get(param.variableName) || "";
      } else if (applicationId) {
        const varValue = await applicationVariableService.getValueForExecution(
          applicationId,
          param.variableName
        );
        value = varValue || "";
        variableCache.set(param.variableName, value);
      }
    } else if (param.isAIGenerated || param.valueSource === "AI_GENERATED") {
      // Use sample value for AI-generated parameters
      value = param.sampleValue || param.value || "";
    } else {
      // Static value - check if it contains variable references
      value = param.value || "";

      // Replace {{variableName}} references in static values
      const varMatches = value.match(/{{\s*([a-zA-Z0-9_]+)\s*}}/g);
      if (varMatches && applicationId) {
        for (const match of varMatches) {
          const varName = match.replace(/{{\s*|\s*}}/g, "");
          let varValue: string;
          if (variableCache.has(varName)) {
            varValue = variableCache.get(varName) || "";
          } else {
            const fetchedValue =
              await applicationVariableService.getValueForExecution(
                applicationId,
                varName
              );
            varValue = fetchedValue || "";
            variableCache.set(varName, varValue);
          }
          value = value.replace(match, varValue);
        }
      }
    }

    result[param.key] = value;
  }

  return result;
}

/**
 * POST /applications/:appId/test-action
 * Execute a custom action for testing
 */
testActionRoutes.post(
  "/:appId/test-action",
  zValidator("json", testActionSchema),
  async (c) => {
    const user = c.get("user");
    const { appId } = c.req.param();
    const body = c.req.valid("json");

    try {
      // Verify user owns the application
      const appResult = await sql<{ id: string }[]>`
        SELECT id FROM app.applications
        WHERE id = ${appId}::uuid AND developer_id = ${user.id}::uuid
      `;

      if (appResult.length === 0) {
        return c.json({ error: "Application not found or access denied" }, 404);
      }

      // Cache for variable lookups
      const variableCache = new Map<string, string>();

      // Build parameter objects
      const headers = await buildParamObject(
        body.headers,
        appId,
        variableCache
      );
      const queryParams = await buildParamObject(
        body.queryParams,
        appId,
        variableCache
      );
      const bodyParams = await buildParamObject(
        body.bodyParams,
        appId,
        variableCache
      );
      const pathParamsObj = await buildParamObject(
        body.pathParams,
        appId,
        variableCache
      );

      // Substitute path parameters in URL
      const substitutedUrl = substitutePathParams(body.url, pathParamsObj);

      // Validate URL for SSRF protection before making the request
      const ssrfValidation = await validateUrlForSSRF(substitutedUrl);
      if (!ssrfValidation.valid) {
        return c.json(
          {
            success: false,
            response: ssrfValidation.error,
            status: 400,
            statusText: "Bad Request",
            duration: 0,
            request: { method: body.method, url: substitutedUrl },
          },
          400
        );
      }

      // Remove query parameters from URL (we'll add them via fetch)
      let cleanUrl = substitutedUrl;
      try {
        const urlObj = new URL(substitutedUrl);
        cleanUrl = `${urlObj.origin}${urlObj.pathname}`;
      } catch {
        // If URL parsing fails, use as-is
      }

      // Build query string
      const queryString = new URLSearchParams(queryParams).toString();
      const finalUrl = queryString ? `${cleanUrl}?${queryString}` : cleanUrl;

      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: body.method,
        headers: {
          ...headers,
        },
      };

      // Add body for non-GET requests
      if (body.method !== "GET" && Object.keys(bodyParams).length > 0) {
        // Check if content-type is set
        const contentType =
          Object.entries(headers).find(
            ([k]) => k.toLowerCase() === "content-type"
          )?.[1] || "application/json";

        if (contentType.includes("application/json")) {
          fetchOptions.body = JSON.stringify(bodyParams);
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          fetchOptions.body = new URLSearchParams(bodyParams).toString();
        } else {
          fetchOptions.body = JSON.stringify(bodyParams);
        }
      }

      // Execute the request
      const startTime = Date.now();

      try {
        const response = await fetch(finalUrl, fetchOptions);
        const duration = Date.now() - startTime;

        // Get response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        // Parse response body
        const contentType = response.headers.get("content-type") || "";
        let responseData: unknown;

        if (contentType.includes("application/json")) {
          try {
            responseData = await response.json();
          } catch {
            responseData = await response.text();
          }
        } else {
          responseData = await response.text();
        }

        return c.json({
          success: response.ok,
          response: responseData,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          duration,
          request: {
            method: body.method,
            url: finalUrl,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            body: Object.keys(bodyParams).length > 0 ? bodyParams : undefined,
          },
        });
      } catch (fetchError) {
        const duration = Date.now() - startTime;
        const errorMessage =
          fetchError instanceof Error ? fetchError.message : "Request failed";

        return c.json({
          success: false,
          response: errorMessage,
          status: 0,
          statusText: "Network Error",
          duration,
          request: {
            method: body.method,
            url: finalUrl,
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test failed";
      return c.json({ error: message }, 500);
    }
  }
);
