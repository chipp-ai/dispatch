# Firecrawl Migration: Replacing Temporal Browser Pool for Knowledge Sources

## Executive Summary

Replace the Temporal browser pool crawling infrastructure with Firecrawl's cloud API for all knowledge source URL scraping and site crawling. This eliminates the flaky browser pool management, stealth mode maintenance, Cloudflare detection workarounds, and Temporal worker resource overhead. Builders are billed per page scraped via a new Stripe usage meter with a 30% markup.

---

## Why Replace

### Current Pain Points

| Problem                                                 | Impact                                             |
| ------------------------------------------------------- | -------------------------------------------------- |
| Cloudflare blocks stop entire crawls                    | Knowledge sources on protected sites fail silently |
| Browser pool memory (~7GB for 5 browsers)               | High pod resource requirements                     |
| Stealth mode insufficient for advanced bot detection    | Scraping failures on modern sites                  |
| No tab/accordion clicking                               | Hidden content missed entirely                     |
| No robots.txt parsing                                   | May crawl disallowed URLs                          |
| No proxy rotation                                       | IP bans on high-volume targets                     |
| Custom link discovery (breadth-first)                   | Slower and less complete than sitemap-based        |
| Memory leaks require browser retirement after 100 pages | Complexity + performance cost                      |
| Temporal workflow orchestration overhead                | Flaky, complex, hard to debug                      |

### What Firecrawl Solves

- Cloudflare/anti-bot bypass via proprietary Fire Engine (cloud only)
- Clean markdown output with `onlyMainContent` stripping nav/footer/sidebar
- Browser `actions` for clicking tabs, accordions, expanding hidden content
- Automatic sitemap + robots.txt parsing
- Built-in proxy rotation
- Async crawl with per-page webhooks for streaming results
- Batch scraping for processing many URLs concurrently
- `/map` endpoint for fast URL discovery without loading every page
- Change tracking to detect when content updates (beta)
- Built-in retry logic and rate limit handling

---

## Firecrawl API Reference

### Endpoints

| Endpoint             | Purpose                                  | Credit Cost  | Rate Limit (Growth) |
| -------------------- | ---------------------------------------- | ------------ | ------------------- |
| `POST /scrape`       | Single page to markdown/HTML/JSON        | 1/page       | 5,000/min           |
| `POST /crawl`        | Recursive site crawl with link traversal | 1/page       | 250/min             |
| `POST /batch/scrape` | Many URLs concurrently                   | 1/page       | 5,000/min           |
| `POST /map`          | Fast URL discovery across a domain       | 1/call       | 5,000/min           |
| `POST /extract`      | LLM-powered structured data extraction   | Variable     | -                   |
| `POST /search`       | Web search + optional page scraping      | 2/10 results | 2,500/min           |

### Scrape Endpoint (`/scrape`)

The core endpoint. Converts a web page into clean, structured data.

**Output formats** (via `formats` param):

- `markdown` - Clean, LLM-ready text (primary use for RAG)
- `html` - Full page markup
- `rawHtml` - Unmodified HTML
- `links` - Extracted URLs
- `screenshot` - Page visual capture
- `json` - Structured data extraction with schema or prompt

**Key parameters:**

```json
{
  "url": "https://example.com/docs",
  "formats": ["markdown"],
  "onlyMainContent": true,
  "timeout": 30000,
  "waitFor": 1000,
  "actions": [
    { "type": "click", "selector": "[role='tab']" },
    { "type": "wait", "milliseconds": 500 }
  ],
  "location": {
    "country": "US",
    "languages": ["en"]
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "markdown": "# Page Title\n\nContent...",
    "metadata": {
      "title": "Page Title",
      "description": "...",
      "sourceURL": "https://example.com/docs",
      "statusCode": 200,
      "language": "en"
    }
  }
}
```

**Browser actions** - Perform user-like interactions before scraping:

- `click` - Click elements via CSS selector
- `write` - Input text into form fields
- `press` - Trigger keyboard events
- `wait` - Pause for dynamic content (milliseconds)
- `screenshot` - Capture page state during interaction
- `executeJavascript` - Run arbitrary JS

**Caching:**

- Default: Returns cached results within 2-day window
- `maxAge: 0` forces fresh scrape
- `storeInCache: false` prevents caching the result

### Crawl Endpoint (`/crawl`)

Recursively crawls a site starting from a URL.

```json
{
  "url": "https://example.com",
  "limit": 50,
  "maxDepth": 5,
  "allowSubdomains": false,
  "scrapeOptions": {
    "formats": ["markdown"],
    "onlyMainContent": true
  }
}
```

**Async by default** - Returns a crawl ID for polling:

```json
{ "success": true, "id": "crawl_abc123" }
```

Poll `GET /crawl/{id}` for status and results. Results paginated in 10MB chunks.

**Webhook support:**

```json
{
  "url": "https://example.com",
  "webhook": {
    "url": "https://api.chipp.ai/webhooks/firecrawl",
    "events": ["crawl.page", "crawl.completed", "crawl.failed"],
    "metadata": { "applicationId": "123" }
  }
}
```

Events: `crawl.started`, `crawl.page` (per page), `crawl.completed`, `crawl.failed`

Webhooks include HMAC-SHA256 signature verification via `X-Firecrawl-Signature` header.

### Map Endpoint (`/map`)

Fast URL discovery without scraping content. Returns all discoverable URLs on a domain.

```json
{
  "url": "https://example.com",
  "search": "documentation",
  "limit": 100
}
```

**Use case:** Discover all URLs first, then batch-scrape only relevant ones. Much faster than recursive crawling for URL discovery.

Supports `search` parameter to find specific URLs ranked by relevance. Uses sitemap data when available (`sitemap: "include"`).

### Batch Scrape (`/batch/scrape`)

Process multiple URLs concurrently. Same options as single scrape.

```json
{
  "urls": ["https://example.com/page1", "https://example.com/page2"],
  "formats": ["markdown"],
  "onlyMainContent": true
}
```

Returns job ID for async tracking. Supports webhooks: `batch_scrape.started`, `batch_scrape.page`, `batch_scrape.completed`, `batch_scrape.failed`.

### Extract Endpoint (`/extract`)

LLM-powered structured data extraction.

```json
{
  "urls": ["https://example.com/pricing"],
  "prompt": "Extract pricing tier information",
  "schema": {
    "type": "object",
    "properties": {
      "plans": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "price": { "type": "number" }
          }
        }
      }
    }
  }
}
```

Supports wildcards (`example.com/*`), schema-based or prompt-only extraction, and web search enhancement.

### Change Tracking

Monitor webpage modifications between scrapes. Compares markdown content and reports `new`, `same`, `changed`, or `removed` status.

**Modes:**

- **Git-diff**: Line-by-line additions/deletions
- **JSON**: Structured field comparison with custom schema

Useful for detecting when a knowledge source's content changes and triggering re-indexing.

### Search Endpoint (`/search`)

Web search with optional content scraping in one call.

```json
{
  "query": "firecrawl documentation",
  "limit": 5,
  "scrapeOptions": {
    "formats": ["markdown"]
  }
}
```

Supports news, image search, location/time filtering, and all scrape options.

---

## Firecrawl Node.js SDK

Package: `@mendable/firecrawl-js`

```typescript
import FirecrawlApp from "@mendable/firecrawl-js";

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

// Scrape
const result = await firecrawl.scrapeUrl("https://example.com", {
  formats: ["markdown"],
  onlyMainContent: true,
});

// Crawl (async)
const crawl = await firecrawl.crawlUrl("https://example.com", {
  limit: 50,
  maxDepth: 5,
  scrapeOptions: { formats: ["markdown"] },
});

// Map
const map = await firecrawl.mapUrl("https://example.com", {
  search: "docs",
  limit: 100,
});

// Batch scrape
const batch = await firecrawl.batchScrapeUrls(
  ["https://example.com/page1", "https://example.com/page2"],
  { formats: ["markdown"] }
);
```

---

## Pricing & Cost Model

### Firecrawl Plans

| Plan       | Monthly  | Credits  | Per Credit    | Concurrent | Overage                  |
| ---------- | -------- | -------- | ------------- | ---------- | ------------------------ |
| Standard   | $47      | 100k     | $0.00047      | 50         | $0.00134 ($47/35k)       |
| **Growth** | **$177** | **500k** | **$0.000354** | **100**    | **$0.00101 ($177/175k)** |
| Scale      | $599     | 1M       | $0.000599     | 150        | N/A                      |

**Growth is the recommended tier.** Cheapest per-credit rate, 100 concurrent browsers (2x current browser pool capacity).

Credits do not roll over monthly. Failed requests are not charged.

### Rate Limits (Growth Tier)

| Endpoint        | Requests/Minute |
| --------------- | --------------- |
| `/scrape`       | 5,000           |
| `/map`          | 5,000           |
| `/crawl`        | 250             |
| `/search`       | 2,500           |
| `/crawl/status` | 1,500           |

### Per Knowledge Source Cost

Every scrape/crawl page = 1 credit. Typical flow: 1 map + N scrapes = N+1 credits.

| Builder Tier | Max Pages    | Credits Used | Cost to Chipp | With 30% Markup |
| ------------ | ------------ | ------------ | ------------- | --------------- |
| FREE         | 10           | 11           | $0.0039       | **$0.0051**     |
| PRO          | 50           | 51           | $0.018        | **$0.023**      |
| TEAM         | 100          | 101          | $0.036        | **$0.047**      |
| BUSINESS     | 500 (est.)   | 501          | $0.177        | **$0.230**      |
| ENTERPRISE   | 1,000 (est.) | 1,001        | $0.354        | **$0.461**      |

### Monthly Volume Estimates

| Scenario                           | Pages/Month | Credits | Plan           | Monthly Cost |
| ---------------------------------- | ----------- | ------- | -------------- | ------------ |
| Light (500 sources, avg 20pp)      | 10k         | ~11k    | Standard ($47) | $47          |
| Medium (2k sources, avg 30pp)      | 60k         | ~62k    | Standard ($47) | $47          |
| Heavy (5k sources, avg 40pp)       | 200k        | ~205k   | Growth ($177)  | $177         |
| Very heavy (10k sources, avg 50pp) | 500k        | ~510k   | Growth ($177)  | ~$187        |

### Breakeven on Base Fee

At Growth ($177/mo), charging builders $0.000460/page (30% markup):

```
$177 / $0.000460 = 384,783 pages to cover base fee
```

Below this volume, treat the $177 as infrastructure cost (replaces Temporal worker pod costs). Above this, every page is profitable at 30% margin.

### Infrastructure Savings

| Current Cost                                             | Monthly Est.   | Eliminated? |
| -------------------------------------------------------- | -------------- | ----------- |
| Temporal worker pods (CPU/memory for browser pool)       | $200-400       | Yes         |
| Browser pool memory (7GB per worker pod)                 | Included above | Yes         |
| ScribeSocial fallback API                                | Per-use        | Possibly    |
| Engineering maintenance (stealth, pool mgmt, leak fixes) | Hours/month    | Yes         |

The browser pool pods alone likely cost more than $177/mo in GKE, making this **net cost negative** before builder billing revenue.

---

## Builder Billing Implementation

### New Stripe Usage Meter

Create a new meter: `chipp_web_scrape_pages`

This follows the existing pattern used for token billing and voice minutes.

**Meter creation:**

```typescript
// Via MCP or Stripe API
createMeter("Web Scrape Pages", "chipp_web_scrape_pages", "sum");
```

**Rate card pricing:**

```
Cost to Chipp:  $0.000354 / page (Growth tier base)
30% markup:     $0.000460 / page
Rounded:        $0.50 / 1,000 pages (~41% effective markup, covers overage)
```

### Reporting Meter Events

After each scrape/crawl completes, report the total pages processed:

```typescript
import { reportMeterEvent } from "./metering";

// After Firecrawl crawl completes
const pagesScraped = crawlResult.data.length;

await reportMeterEvent(
  "chipp_web_scrape_pages",
  organization.stripeCustomerId,
  pagesScraped,
  `crawl-${applicationId}-${Date.now()}` // idempotency key
);
```

**When to report:**

- After single URL scrape: report 1 page
- After site crawl: report total pages scraped
- After batch scrape: report batch size
- Map calls: report 1 (or bundle into the subsequent scrape count)

### Billing Flow

```
Builder adds knowledge source URL
    |
    v
Firecrawl /map (discover URLs) -----> 1 credit consumed
    |
    v
Firecrawl /crawl or /batch/scrape --> N credits consumed
    |
    v
Content returned as markdown
    |
    v
Chunking + embedding pipeline (unchanged)
    |
    v
reportMeterEvent("chipp_web_scrape_pages", customerId, N+1)
    |
    v
Stripe aggregates into rate_card line item
    |
    v
Builder invoiced at end of billing cycle:
  - License fee (Pro/Team/Business)
  - Token usage charges
  - Web scrape page charges  <-- NEW
  - Deduct included credits
```

### Integration with Existing Pricing Plans

Add the `chipp_web_scrape_pages` meter to existing v2 pricing plans (PRO_MONTHLY, TEAM_MONTHLY, BUSINESS_MONTHLY, etc.) as an additional rate card component alongside the token meter.

Builders see a new line item on their Stripe invoice: "Web Scrape Pages - X pages @ $0.0005/page"

---

## Current Architecture Being Replaced

### Existing Crawl Pipeline

```
URL submitted
    |
    v
validateUrl() --> SSRF protection
    |
    v
Temporal siteCrawlerStreamWorkflow
    |
    v
linkDiscovery.ts (breadth-first, same-domain)
    |
    v
webScraper.ts activity (BrowserPoolManager)
    |
    +-- 5 Playwright browsers, 10 pages each
    +-- Stealth mode (basic bot evasion)
    +-- Auto-scroll to load lazy content
    +-- Cloudflare detection (throws CloudflareBlockError)
    |
    v
Gemini content cleaning
    |
    v
Chunking --> Embeddings --> PostgreSQL
```

### Key Files Being Replaced

| File                                                       | Purpose                                             | Replacement                   |
| ---------------------------------------------------------- | --------------------------------------------------- | ----------------------------- |
| `chipp-temporal-worker/src/utils/browser-pool-manager.ts`  | Playwright browser pool (5 browsers, 50 concurrent) | Firecrawl API                 |
| `chipp-temporal-worker/src/utils/web-scraper-pooled.ts`    | Pooled web scraper with stealth mode                | Firecrawl `/scrape`           |
| `chipp-temporal-worker/src/activities/webScraper.ts`       | Temporal activity for single page scraping          | Firecrawl `/scrape`           |
| `chipp-temporal-worker/src/activities/linkDiscovery.ts`    | Link extraction + URL validation                    | Firecrawl `/map`              |
| `chipp-temporal-worker/src/workflows/siteCrawler.ts`       | Multi-page crawl orchestration                      | Firecrawl `/crawl`            |
| `chipp-temporal-worker/src/workflows/siteCrawlerStream.ts` | Streaming crawl with progress                       | Firecrawl `/crawl` + webhooks |
| `chipp-temporal-worker/src/utils/link-extractor.ts`        | HTML parsing for link discovery                     | Firecrawl `/map`              |
| `shared/utils-server/src/urlReader.ts`                     | URL reader with Firecrawl fallback                  | Firecrawl as primary          |

### What Stays

| Component                                         | Why                                                         |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `validateUrl()`                                   | Still validate URLs before sending to Firecrawl             |
| Chunking pipeline                                 | Firecrawl returns markdown, chunking is downstream          |
| Embedding generation                              | Unchanged                                                   |
| PostgreSQL vector storage                         | Unchanged                                                   |
| `fileRag.ts` workflow                             | May be simplified but still orchestrates chunk/embed phases |
| Crawl limits per tier (`crawlAndUploadLimits.ts`) | Still enforce page limits, pass as `limit` to Firecrawl     |
| PG mode checks                                    | Block Firecrawl in air-gapped deployments                   |

---

## Firecrawl Self-Hosting (for Air-Gap / PG Mode)

The open-source version can be self-hosted via Docker for air-gapped deployments.

**Setup:**

```bash
# .env
PORT=3002
HOST=0.0.0.0
USE_DB_AUTHENTICATION=false

# Optional
PROXY_SERVER=...
PROXY_USERNAME=...
PROXY_PASSWORD=...

docker compose build && docker compose up
# Available at http://localhost:3002
```

**Limitations vs. cloud:**

- No Fire Engine (no advanced anti-bot/Cloudflare bypass)
- Basic Playwright scraping only
- No proprietary proxy rotation
- Must manage your own infrastructure

**When to use:** Only for PG/air-gapped deployments where external API calls are prohibited. For all other deployments, use the cloud API.

---

## Capabilities Not Available in Current System

### 1. Cloudflare / Anti-Bot Bypass (Cloud Only)

Fire Engine handles Cloudflare challenges, bot detection, CAPTCHAs. Current system detects blocks and throws `CloudflareBlockError`, failing the crawl.

### 2. Map Endpoint (Fast URL Discovery)

Current system loads every page via browser to discover links (breadth-first crawl). Firecrawl `/map` discovers URLs from sitemaps + link analysis in a single fast call without rendering pages.

### 3. Browser Actions (Hidden Content)

Current system scrolls to bottom but never clicks tabs, accordions, or expand buttons. Firecrawl `actions` parameter enables click, wait, JS execution before content extraction.

### 4. Automatic robots.txt Parsing

Current system uses HEAD requests to check URL accessibility but doesn't parse robots.txt. Firecrawl respects robots.txt automatically.

### 5. Built-in Proxy Rotation

Current system has no proxy support. Firecrawl rotates proxies automatically (`proxy: "auto"`).

### 6. Change Tracking

No equivalent in current system. Firecrawl can detect content changes between scrapes, enabling efficient knowledge source refresh (only re-process changed pages).

### 7. Structured Data Extraction

No equivalent. Firecrawl `/extract` uses LLMs to extract structured JSON from pages using schemas or prompts. Potential use for metadata extraction, pricing table parsing, etc.

### 8. Location/Language Targeting

Current system scrapes from wherever the worker pod runs. Firecrawl can target specific countries/languages via regional proxies.

### 9. Batch Processing with Webhooks

Current system processes pages sequentially within a Temporal workflow. Firecrawl `/batch/scrape` processes many URLs concurrently with per-page webhook notifications.

### 10. Built-in Caching

Current system has no scrape caching. Firecrawl caches results for 2 days with configurable freshness, reducing redundant scrapes.

---

## Migration Considerations

### Gemini Content Cleaning

Current pipeline uses Gemini to clean extracted content for RAG quality. Firecrawl's `onlyMainContent` is rule-based, not LLM-based.

**Options:**

1. Use Firecrawl's markdown directly (simpler, good enough for most cases)
2. Keep Gemini cleaning as a post-processing step on Firecrawl's markdown output (higher quality RAG)
3. Use Firecrawl's `/extract` with a cleaning prompt (moves LLM cost to Firecrawl credits)

Recommend option 1 initially, with option 2 as an upgrade if RAG quality degrades.

### Air-Gap (PG Mode)

Firecrawl cloud cannot be used in air-gapped deployments. Options:

- Self-host Firecrawl Docker in PG environments (loses anti-bot features)
- Keep a minimal browser pool for PG-mode only
- Accept reduced scraping capability in air-gapped deployments

The existing `isPGModeEnabled()` checks already gate external service calls throughout the codebase. Same pattern applies.

### ScribeSocial Dependency

ScribeSocial is used as a last resort for social media URLs (video transcription, social post analysis). Firecrawl does not replace this - it handles web pages, not social media content extraction. Keep ScribeSocial for social/video URLs if still needed.

### Existing Firecrawl API Key

There is already a hardcoded Firecrawl API key in `shared/utils-server/src/urlReader.ts`:

```
fc-4c135097281347689c4deccf37ee8438
```

This should be moved to an environment variable (`FIRECRAWL_API_KEY`) and managed via 1Password/K8s secrets. The `api-orchestrator/src/utils/firecrawl-service.ts` already reads from `process.env.FIRECRAWL_API_KEY`.

### Webhook Infrastructure

If using Firecrawl webhooks for streaming crawl progress (recommended for large crawls), you'll need a webhook endpoint in chipp-deno or chipp-admin to receive per-page results and feed them into the chunking pipeline.

Webhook payloads include HMAC-SHA256 signatures for verification. Configure `FIRECRAWL_WEBHOOK_SECRET` for signature validation.
