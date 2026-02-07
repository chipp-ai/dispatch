/**
 * Firecrawl Service
 *
 * Thin wrapper around Firecrawl HTTP API for URL scraping and site crawling.
 * Uses native fetch() - no npm SDK needed for Deno.
 */

import { log } from "@/lib/logger.ts";

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";
const SCRAPE_TIMEOUT_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 1_000;

export interface FirecrawlScrapeResult {
  markdown: string;
  metadata: {
    title?: string;
    description?: string;
    sourceURL?: string;
    statusCode?: number;
    [key: string]: unknown;
  };
}

export interface FirecrawlCrawlPage {
  markdown: string;
  metadata: {
    title?: string;
    description?: string;
    sourceURL?: string;
    statusCode?: number;
    [key: string]: unknown;
  };
}

export interface FirecrawlCrawlStatus {
  status: "scraping" | "completed" | "failed" | "cancelled";
  total: number;
  completed: number;
  data: FirecrawlCrawlPage[];
  expiresAt?: string;
}

function getApiKey(): string | null {
  return Deno.env.get("FIRECRAWL_API_KEY") || null;
}

/**
 * Check if Firecrawl is available (API key set and not in PG mode)
 */
export function isFirecrawlAvailable(): boolean {
  const pgEnabled = Deno.env.get("PG_ENABLED") === "true";
  return !pgEnabled && !!getApiKey();
}

async function firecrawlFetch(
  path: string,
  options: RequestInit & { retryOn429?: boolean } = {}
): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY is not configured");
  }

  const { retryOn429 = true, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", "application/json");

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

    try {
      const response = await fetch(`${FIRECRAWL_BASE_URL}${path}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Retry on 429 with exponential backoff
      if (
        response.status === 429 &&
        retryOn429 &&
        attempt < MAX_RETRY_ATTEMPTS - 1
      ) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        log.warn("Rate limited (429), retrying", {
          source: "firecrawl-service",
          feature: "request",
          delay,
          attempt: attempt + 1,
        });
        lastResponse = response;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Fail immediately on 402 (payment required)
      if (response.status === 402) {
        const body = await response.text();
        throw new Error(`Firecrawl payment required (402): ${body}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `Firecrawl request timed out after ${SCRAPE_TIMEOUT_MS}ms`
        );
      }

      // Rethrow if not a retryable error
      if (attempt === MAX_RETRY_ATTEMPTS - 1) throw error;

      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      log.warn("Request failed, retrying", {
        source: "firecrawl-service",
        feature: "request",
        delay,
        attempt: attempt + 1,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should not reach here, but handle edge case
  throw new Error("Firecrawl request failed after max retries");
}

export const firecrawlService = {
  /**
   * Scrape a single URL and return markdown content
   */
  async scrapeUrl(url: string): Promise<FirecrawlScrapeResult> {
    log.info("Scraping URL", { source: "firecrawl-service", feature: "scrape", url });

    const response = await firecrawlFetch("/scrape", {
      method: "POST",
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 30000,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(
        `Firecrawl scrape failed (${response.status}): ${errorBody}`
      );
      log.error("Firecrawl scrape failed", {
        source: "firecrawl-service",
        feature: "scrape",
        url,
        status: response.status,
        errorBody,
      }, error);
      throw error;
    }

    const result = (await response.json()) as {
      success: boolean;
      data?: { markdown?: string; metadata?: Record<string, unknown> };
    };

    if (!result.success || !result.data?.markdown) {
      throw new Error("Firecrawl scrape returned no content");
    }

    log.info("Scrape complete", {
      source: "firecrawl-service",
      feature: "scrape",
      url,
      contentLength: result.data.markdown.length,
    });

    return {
      markdown: result.data.markdown,
      metadata: (result.data.metadata ||
        {}) as FirecrawlScrapeResult["metadata"],
    };
  },

  /**
   * Start a site crawl (async - returns crawl ID for polling)
   */
  async startCrawl(params: {
    url: string;
    maxPages: number;
    maxDepth: number;
  }): Promise<{ id: string }> {
    const { url, maxPages, maxDepth } = params;

    log.info("Starting crawl", { source: "firecrawl-service", feature: "crawl-start", url, maxPages, maxDepth });

    const response = await firecrawlFetch("/crawl", {
      method: "POST",
      body: JSON.stringify({
        url,
        limit: maxPages,
        maxDepth,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(
        `Firecrawl crawl start failed (${response.status}): ${errorBody}`
      );
      log.error("Firecrawl crawl start failed", {
        source: "firecrawl-service",
        feature: "crawl-start",
        url,
        maxPages,
        maxDepth,
        status: response.status,
        errorBody,
      }, error);
      throw error;
    }

    const result = (await response.json()) as { success: boolean; id?: string };

    if (!result.success || !result.id) {
      throw new Error("Firecrawl crawl did not return a crawl ID");
    }

    log.info("Crawl started", { source: "firecrawl-service", feature: "crawl-start", crawlId: result.id, url });

    return { id: result.id };
  },

  /**
   * Check the status of an active crawl
   */
  async getCrawlStatus(crawlId: string): Promise<FirecrawlCrawlStatus> {
    const response = await firecrawlFetch(`/crawl/${crawlId}`, {
      method: "GET",
      retryOn429: true,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Firecrawl crawl status failed (${response.status}): ${errorBody}`
      );
    }

    const result = (await response.json()) as {
      status: string;
      total: number;
      completed: number;
      data: Array<{ markdown?: string; metadata?: Record<string, unknown> }>;
      expiresAt?: string;
    };

    return {
      status: result.status as FirecrawlCrawlStatus["status"],
      total: result.total || 0,
      completed: result.completed || 0,
      data: (result.data || []).map((page) => ({
        markdown: page.markdown || "",
        metadata: (page.metadata || {}) as FirecrawlCrawlPage["metadata"],
      })),
      expiresAt: result.expiresAt,
    };
  },

  /**
   * Cancel an active crawl
   */
  async cancelCrawl(crawlId: string): Promise<void> {
    log.info("Cancelling crawl", { source: "firecrawl-service", feature: "crawl-cancel", crawlId });

    try {
      const response = await firecrawlFetch(`/crawl/${crawlId}`, {
        method: "DELETE",
        retryOn429: false,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        log.error("Firecrawl cancel crawl failed", {
          source: "firecrawl-service",
          feature: "crawl-cancel-response",
          crawlId,
          status: response.status,
          errorBody,
        });
      }
    } catch (error) {
      log.error("Cancel crawl error", {
        source: "firecrawl-service",
        feature: "crawl-cancel",
        crawlId,
      }, error);
    }
  },
};
