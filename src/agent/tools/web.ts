/**
 * Web Tools for Chipp Deno Agent
 *
 * Provides web browsing and URL retrieval capabilities.
 */

import { z } from "zod";
import type { ToolRegistry } from "../registry.ts";
import * as Sentry from "@sentry/deno";

// Types for Serper API response
interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  sitelinks?: { title: string; link: string }[];
  position: number;
}

interface SerperKnowledgeGraph {
  title: string;
  type: string;
  website?: string;
  imageUrl?: string;
  description?: string;
  descriptionSource?: string;
  descriptionLink?: string;
  attributes?: Record<string, string>;
}

interface SerperPeopleAlsoAsk {
  question: string;
  snippet: string;
  title: string;
  link: string;
}

interface SerperResponse {
  searchParameters: {
    q: string;
    gl?: string;
    hl?: string;
    autocorrect?: boolean;
    page?: number;
    type?: string;
  };
  knowledgeGraph?: SerperKnowledgeGraph;
  organic: SerperSearchResult[];
  peopleAlsoAsk?: SerperPeopleAlsoAsk[];
  relatedSearches?: { query: string }[];
}

/**
 * Search the web using Serper API
 */
async function searchWeb(query: string): Promise<SerperResponse | string> {
  console.log(`[browseWeb] Searching web for: "${query}"`);
  const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");

  if (!SERPER_API_KEY) {
    console.error("[browseWeb] SERPER_API_KEY not configured");
    return "Web search is not configured. Please contact the administrator.";
  }

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query }),
    });

    if (!response.ok) {
      console.error(
        `Serper API error: ${response.status} ${response.statusText}`
      );
      return `Web search failed with status ${response.status}. Please try again later.`;
    }

    const data: SerperResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error searching web:", error);
    Sentry.captureException(error, {
      tags: { source: "agent-web-tool", feature: "web-search" },
      extra: { query },
    });
    return "An error occurred while searching the web. Please try again later.";
  }
}

/**
 * Fetch and extract content from a URL
 */
async function fetchUrl(url: string): Promise<string> {
  try {
    // Validate URL
    const urlObj = new URL(url);
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return "Invalid URL: Only HTTP and HTTPS URLs are supported.";
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ChippBot/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      const statusMessages: Record<number, string> = {
        401: "The URL requires authentication (401 Unauthorized). Please ensure the URL is publicly accessible.",
        403: "Access forbidden (403). The server is blocking access to this content.",
        404: "Page not found (404). Please verify the URL is correct.",
        429: "Too many requests (429). Please try again later.",
      };

      if (response.status >= 500) {
        return "The server encountered an error (5xx). Please try again later.";
      }

      return (
        statusMessages[response.status] ||
        `Failed to fetch URL: ${response.status} ${response.statusText}`
      );
    }

    const contentType = response.headers.get("content-type") || "";

    // Handle different content types
    if (contentType.includes("text/html")) {
      const html = await response.text();
      return extractTextFromHtml(html, url);
    } else if (contentType.includes("text/plain")) {
      return await response.text();
    } else if (contentType.includes("application/json")) {
      const json = await response.json();
      return JSON.stringify(json, null, 2);
    } else {
      return `Content type "${contentType}" is not supported. Only HTML, plain text, and JSON are supported.`;
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("Invalid URL")) {
      return "Invalid URL format. Please provide a valid URL.";
    }
    console.error("Error fetching URL:", error);
    Sentry.captureException(error, {
      tags: { source: "agent-web-tool", feature: "fetch-url" },
      extra: { url },
    });
    return `An error occurred while retrieving the URL: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Extract readable text content from HTML
 * Simple extraction without external dependencies
 */
function extractTextFromHtml(html: string, sourceUrl: string): string {
  // Remove script and style tags
  let text = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Replace common block elements with newlines
  text = text.replace(/<(br|p|div|h[1-6]|li|tr)[^>]*>/gi, "\n");

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&hellip;/g, "...");
  text = text.replace(/&mdash;/g, "—");
  text = text.replace(/&ndash;/g, "–");

  // Clean up whitespace
  text = text.replace(/\s+/g, " ");
  text = text.replace(/\n\s+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  // Truncate if too long (keep it reasonable for context)
  const maxLength = 50000;
  if (text.length > maxLength) {
    text =
      text.substring(0, maxLength) + "\n\n[Content truncated due to length]";
  }

  return `Source: ${sourceUrl}\n\n${text}`;
}

/**
 * Register web tools with the agent registry
 */
export function registerWebTools(registry: ToolRegistry): void {
  // Browse Web - Search the internet
  registry.register({
    name: "browseWeb",
    description:
      "Search the web for information. Use this to find current information, news, or answers to questions.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "The search query. Construct this from the user's message and optimize it to be a good search term."
        ),
      timeHorizon: z
        .object({
          startDate: z
            .string()
            .optional()
            .describe("Start date for the search in YYYY-MM-DD format"),
          endDate: z
            .string()
            .optional()
            .describe("End date for the search in YYYY-MM-DD format"),
        })
        .optional()
        .describe(
          "Optional time range for the search. Only include if the user needs time-specific results."
        ),
    }),
    execute: async ({ query, timeHorizon }) => {
      let searchQuery = query;

      // Add time constraints to query if provided
      if (timeHorizon?.startDate) {
        searchQuery += ` after:${timeHorizon.startDate}`;
      }
      if (timeHorizon?.endDate) {
        searchQuery += ` before:${timeHorizon.endDate}`;
      }

      const results = await searchWeb(searchQuery);
      return results;
    },
  });

  // Retrieve URL - Get content from a specific URL
  registry.register({
    name: "retrieveUrl",
    description:
      "Retrieve and read the content from a specific URL. Use this when the user provides a link or you need to access a specific webpage.",
    parameters: z.object({
      url: z.string().describe("The URL to retrieve content from"),
      query: z
        .string()
        .optional()
        .describe(
          "Optional: What specific information to look for. Phrase as a detailed question if provided."
        ),
    }),
    execute: async ({ url, query }) => {
      const content = await fetchUrl(url);

      // If a query is provided, we could add context about what to look for
      if (
        query &&
        typeof content === "string" &&
        !content.startsWith("Invalid") &&
        !content.startsWith("Failed")
      ) {
        return {
          content,
          query,
          note: "Search the content above to answer the query.",
        };
      }

      return content;
    },
  });
}
