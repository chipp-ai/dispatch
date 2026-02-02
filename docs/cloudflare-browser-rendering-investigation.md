# Investigation: Cloudflare Browser Rendering as Browser Infrastructure Replacement

**Date:** 2026-01-27
**Status:** Research Complete - Pending Decision
**Author:** Claude (deep dive investigation)

## Summary

Evaluated Cloudflare Browser Rendering as a potential replacement for the self-hosted Playwright browser pool + Temporal workflow infrastructure used for web scraping, site crawling, and link discovery. Conclusion: strong replacement for browser infrastructure management and simple single-page operations, but not a drop-in replacement for crawl orchestration, bot stealth, or LLM-powered content processing. A hybrid approach is recommended.

---

## Current Architecture

### Components

| Component      | Implementation                                                                                                   | Key Files                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Browser Pool   | `@crawlee/browser-pool` managing 5 Playwright instances, each handling 10 concurrent pages (50 total)            | `chipp-temporal-worker/src/utils/browser-pool-manager.ts` (209 lines) |
| Scraper        | Multi-stage pipeline: navigate, screenshot, scroll, expand interactive elements, HTML-to-Markdown via Gemini LLM | `chipp-temporal-worker/src/utils/web-scraper-pooled.ts` (1730 lines)  |
| Stealth        | Anti-bot evasion: webdriver masking, WebGL fingerprinting, mouse simulation, typing with typos                   | `chipp-temporal-worker/src/utils/browser-stealth.ts` (803 lines)      |
| Workflows      | 3 Temporal workflows: single-page scrape, batch crawl, streaming crawl with real-time progress                   | `chipp-temporal-worker/src/workflows/`                                |
| Link Discovery | Playwright-based link extraction with accessibility checks, same-domain filtering, depth tracking                | `chipp-temporal-worker/src/activities/linkDiscovery.ts` (326 lines)   |

### Scraping Pipeline (Full Mode)

```
1. Navigate with networkidle fallback to load event (30s timeout)
2. Human-like post-navigation behavior (delays, random scroll)
3. Wait for optional selector
4. Capture screenshot (centered 1280x800 clip) + thumbnail
5. Auto-scroll to bottom (50 steps max, 12s timeout) for lazy loading
6. Expand interactive elements: tabs, accordions, details (max 20)
7. Extract full HTML + metadata
8. Clean HTML to Markdown via LLM or Turndown fallback
```

### Temporal Workflows

- **`webScraperWorkflow`**: Single URL scraping. 2-minute timeout, 3x retry with 1s-30s exponential backoff. Non-retryable: `InvalidUrlError`, `AccessDeniedError`.
- **`crawlSiteWorkflow`**: Sequential link discovery then batch scraping. Default concurrency: 5.
- **`siteCrawlerStreamWorkflow`**: Real-time streaming crawl with Temporal queries for progress. Phases: initializing -> crawling -> indexing -> complete/failed. Saves pages to DB immediately during crawl. Cleanup on failure (deletes orphaned saved pages).

### Configuration

```
BROWSER_POOL_SIZE = 5
BROWSER_POOL_MAX_PAGES_PER_BROWSER = 10
BROWSER_POOL_RETIRE_AFTER_PAGE_COUNT = 100
BROWSER_POOL_PAGE_IDLE_TIMEOUT = 30s
BROWSER_POOL_BROWSER_IDLE_TIMEOUT = 60s
Max crawl depth: 3
Max pages per crawl: 50
Crawl concurrency: 5
```

### Known Pain Points

1. **Timeout inconsistencies** - Navigation: 30s, scrolling: 12s, activity: 2min. A page taking 25s to load + 12s scroll + cleanup can exceed activity timeout.
2. **Memory leak risk** - Browser retirement by page count (100), not memory usage. No heap monitoring.
3. **O(n^2) link discovery** - No concurrency limit on accessibility HEAD requests. 50 pages x 20 links = 1000 sequential HEAD requests.
4. **Race conditions** - `savedPages` Set and `savedFileIds` Map can get out of sync in stream workflow on partial save failure.
5. **Diagnostic logging volume** - ~750 log entries per crawl from 30+ DIAGNOSTIC lines per batch.
6. **Screenshot upload** - No retry on GCS upload failure. URL may be null.
7. **Interactive element expansion** - No per-expansion timeout. Can hang indefinitely within activity timeout.
8. **Error message loss** - Batch promise catch discards original activity error, returns generic "Scraping failed".

---

## Cloudflare Browser Rendering

### Overview

Headless Chrome running on Cloudflare's global edge network. Two integration modes: REST API (stateless, simple) and Workers Bindings (Puppeteer/Playwright in Cloudflare Workers).

- Docs: https://developers.cloudflare.com/browser-rendering/
- API Reference: https://developers.cloudflare.com/api/resources/browser_rendering/

### REST API Endpoints

All endpoints: `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/browser-rendering/{endpoint}`

Auth: Bearer token with `Browser Rendering - Edit` permission.

| Endpoint      | Purpose                                                          | Response                                  |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `/content`    | Fully rendered HTML after JS execution                           | `Envelope<string>` - HTML string          |
| `/screenshot` | Visual capture with viewport/clip/fullPage options               | Binary image (PNG/JPEG)                   |
| `/snapshot`   | HTML + screenshot in one call                                    | `{ content: string, screenshot: base64 }` |
| `/pdf`        | Page rendered as PDF                                             | Binary PDF                                |
| `/scrape`     | Element attributes via CSS selectors (text, HTML, dimensions)    | `Array<{ selector, results }>`            |
| `/json`       | AI-powered structured data extraction via prompt or JSON schema  | `Record<string, unknown>`                 |
| `/links`      | Hyperlink extraction with optional `excludeExternalLinks` filter | `Array<string>`                           |
| `/markdown`   | HTML-to-Markdown conversion                                      | `string`                                  |

### Common Parameters (All Endpoints)

| Parameter                    | Type    | Description                                           |
| ---------------------------- | ------- | ----------------------------------------------------- |
| `url`                        | string  | Target webpage (required, or use `html`)              |
| `html`                       | string  | Raw HTML to render (alternative to `url`)             |
| `gotoOptions.waitUntil`      | string  | `networkidle0`, `networkidle2`, or default load event |
| `gotoOptions.timeout`        | integer | Page load timeout in ms                               |
| `waitForSelector`            | string  | CSS selector to wait for before action                |
| `viewport.width`             | integer | Default: 1920                                         |
| `viewport.height`            | integer | Default: 1080                                         |
| `viewport.deviceScaleFactor` | number  | Scale for high-DPI screenshots                        |
| `cookies`                    | array   | Session cookies (name, value, domain, path)           |
| `authenticate`               | object  | HTTP credentials                                      |
| `userAgent`                  | string  | Custom UA (does NOT bypass bot detection)             |
| `addScriptTag`               | array   | Inject JavaScript before render                       |
| `addStyleTag`                | array   | Inject CSS                                            |
| `rejectResourceTypes`        | array   | Block resource types (e.g., "image")                  |
| `rejectRequestPattern`       | array   | Block requests matching regex                         |
| `setExtraHTTPHeaders`        | object  | Custom HTTP headers                                   |

### `/screenshot` Specific Parameters

| Parameter                          | Description                              |
| ---------------------------------- | ---------------------------------------- |
| `screenshotOptions.fullPage`       | Capture entire scrollable page           |
| `screenshotOptions.type`           | Format: png, jpeg                        |
| `screenshotOptions.quality`        | JPEG quality (requires non-png type)     |
| `screenshotOptions.clip`           | Capture specific region                  |
| `screenshotOptions.omitBackground` | Enables transparency                     |
| `selector`                         | CSS selector to capture specific element |

### `/scrape` Response Format

```json
{
  "success": true,
  "result": [
    {
      "selector": "h1",
      "results": [
        {
          "text": "Page Title",
          "html": "<h1>Page Title</h1>",
          "attributes": [{ "name": "class", "value": "title" }],
          "height": 40,
          "width": 800,
          "top": 100,
          "left": 50
        }
      ]
    }
  ]
}
```

### `/json` AI Extraction

Supports three modes:

- **Prompt only**: Natural language instruction, returns unstructured extraction
- **Schema only**: JSON Schema defining output structure
- **Prompt + schema**: Combines both for guided structured extraction
- **Custom AI models**: `custom_ai` array with `"<provider>/<model_name>"` and bearer token. Supports automatic failover across multiple models.

```json
{
  "url": "https://example.com/products",
  "prompt": "Extract all product names and prices",
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "products",
      "schema": {
        "type": "object",
        "properties": {
          "products": {
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
  }
}
```

### `/links` Specific Parameters

| Parameter              | Description               |
| ---------------------- | ------------------------- |
| `visibleLinksOnly`     | Only return visible links |
| `excludeExternalLinks` | Only same-domain links    |

### Workers Bindings

For complex automation requiring full Puppeteer/Playwright control.

**Cloudflare's Puppeteer fork**: `@cloudflare/puppeteer` (v1.0.5, based on Puppeteer v22.13.1)

```javascript
import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const browser = await puppeteer.launch(env.MYBROWSER);
    const page = await browser.newPage();
    await page.goto("https://example.com");
    const metrics = await page.metrics();
    await browser.close();
    return Response.json(metrics);
  },
};
```

**Custom session management methods** (beyond standard Puppeteer):

- `puppeteer.sessions(endpoint)` - List active sessions with connection metadata
- `puppeteer.history()` - Recent sessions (open/closed) with closure reasons
- `puppeteer.limits()` - Active constraints: `maxConcurrentSessions`, `allowedBrowserAcquisitions`, `timeUntilNextAllowedBrowserAcquisition`

**Session reuse pattern**:

1. Call `puppeteer.sessions()` to find unconnected sessions
2. `puppeteer.connect(env.MY_BROWSER, sessionID)` to reconnect
3. Fall back to `puppeteer.launch()` if no sessions available
4. Use `browser.disconnect()` (not `browser.close()`) to keep session alive

**Durable Objects integration**: Persistent browser sessions that survive across requests. Uses alarm system to extend lifetime (e.g., 60s keep-alive with 10s alarm intervals).

**Playwright support**: `@cloudflare/playwright` v1.1.0 (Playwright v1.57.0). Also supported via Workers bindings.

**Stagehand**: Open source browser automation framework powered by Workers AI. Also supported.

**Key limitations of Workers bindings**:

- XPath selectors unsupported (use CSS selectors or `page.evaluate()`)
- `page.evaluate()` returns only primitive types (no HTMLElement)
- User agent customization does NOT bypass bot detection
- 1MB request size limit in local development

### Pricing

|                                    | Free Plan                 | Paid Plan                                    |
| ---------------------------------- | ------------------------- | -------------------------------------------- |
| Browser hours                      | 10 min/day                | 10 hours/month, then $0.09/hour              |
| Concurrent browsers (Workers only) | 3                         | 10 included, then $2.00/month per additional |
| New instances/min                  | 3                         | 30                                           |
| REST API rate limit                | 6 req/min                 | 180 req/min (3/sec)                          |
| Inactivity timeout                 | 60s (extendable to 10min) | 60s (extendable to 10min)                    |

**Billing details:**

- REST API: charged only for browser hours, no concurrent browser fees
- Workers Bindings: charged for browser hours + concurrent browsers
- Failed REST API requests are not charged
- `X-Browser-Ms-Used` response header tracks usage per request
- Concurrent browser cost uses monthly average of daily peak (no spike penalty)

### Rate Limiting

- Fixed per-second fill rate, not burst allowance
- Requests must be evenly distributed
- Exceeding limits returns HTTP 429 with `Retry-After` header
- Can request higher limits from Cloudflare

---

## Head-to-Head Comparison

| Dimension                 | Current (Self-Hosted)                                                   | Cloudflare Browser Rendering                                   |
| ------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Infrastructure**        | K8s pods running Playwright + Temporal                                  | Cloudflare edge network, zero infra management                 |
| **Scaling**               | Manual (5 browsers x 10 pages = 50 concurrent)                          | Auto-scaling, 30 concurrent browsers paid (requestable higher) |
| **Cold Start**            | ~95% reduced via pool reuse, still needs pod scheduling                 | "Low cold-start time" on global edge                           |
| **Browser Lifecycle**     | Custom retirement, idle timeouts, memory management                     | Fully managed by Cloudflare                                    |
| **Stealth/Bot Evasion**   | 800 lines of custom stealth code                                        | **None** - "requests will always be identified as a bot"       |
| **HTML -> Markdown**      | Gemini LLM with retry + Turndown fallback (20-50s)                      | Built-in `/markdown` endpoint (seconds)                        |
| **Screenshots**           | Playwright capture + GCS upload                                         | `/screenshot` returns binary directly                          |
| **Link Discovery**        | Playwright page + manual extraction + HEAD checks                       | `/links` with `excludeExternalLinks` filter                    |
| **Structured Extraction** | Not available                                                           | `/json` with AI prompts + JSON schema                          |
| **Site Crawling**         | Full Temporal workflow with streaming progress, batching, depth control | **No built-in crawling** - must orchestrate yourself           |
| **Session Persistence**   | Browser pool with reuse                                                 | `keep_alive` up to 10min, Durable Objects for longer           |
| **Interactive Expansion** | Auto-expands tabs, accordions, details elements                         | Not built-in (need Workers + custom Puppeteer code)            |
| **Cost**                  | K8s compute (always-on pods) + Temporal server + Gemini API             | $0.09/hour after 10 free hours/month                           |
| **Rate Limits**           | Only infra limits                                                       | Paid: 180 req/min REST, 30 new instances/min                   |

---

## Gap Analysis

### What CF Browser Rendering Does NOT Replace

1. **Site crawling orchestration** - No crawl workflow. You still need Temporal (or Cloudflare Queues/Workers) to orchestrate multi-page crawls with depth control, deduplication, batch processing, and progress tracking.

2. **Bot stealth** - The biggest gap. CF explicitly states all requests are identified as bots. The 800-line stealth module exists because many sites block bots. Sites that currently work with stealth measures would likely block CF Browser Rendering.

3. **Interactive element expansion** - The scraper auto-expands tabs, accordions, and `<details>` elements before extraction. CF REST API doesn't do this. Requires Workers bindings with custom Puppeteer code to replicate.

4. **Streaming crawl progress** - `siteCrawlerStreamWorkflow` provides real-time Temporal queries for crawl progress (phase, percentage, favicon, per-page status). CF has no equivalent. Must be built on top.

5. **LLM-based HTML cleaning with custom intent** - Pipeline uses Gemini with cleaning intents (`RAG_INDEXING`, `API_DOCUMENTATION`, `STRUCTURED_DATA`). CF's `/markdown` is generic. The `/json` endpoint could partially replace structured extraction but not RAG-optimized markdown.

6. **PredictionGuard support** - Air-gapped/enterprise customers using PG as LLM provider cannot use CF's AI endpoints.

### What CF Browser Rendering Replaces Well

1. **Browser pool management** - Eliminates `browser-pool-manager.ts` entirely. No browser lifecycle, retirement policies, idle timeouts, or memory leak concerns.

2. **Simple page scraping** - `/snapshot` (HTML + screenshot in one call) replaces multi-stage navigate + screenshot pipeline for simple cases.

3. **Link discovery** - `/links` with `excludeExternalLinks` replaces link discovery activity for sites that don't block bots.

4. **Markdown conversion** - `/markdown` replaces Gemini/Turndown pipeline for generic content.

5. **Infrastructure overhead** - No K8s pods, Playwright binary management, or Chrome dependency updates.

---

## Cost Analysis

### Current Estimated Cost

- Temporal worker pods (always running): ~2-4 pods with Playwright/Chromium
- Each pod: ~1-2 GB RAM for browser pool
- Significant K8s compute cost (hundreds of $/month)
- Plus Gemini API calls for HTML cleaning

### Cloudflare Estimated Cost

| Volume                      | Browser Time      | Monthly Cost |
| --------------------------- | ----------------- | ------------ |
| 50 scrapes/day @ 30s each   | ~12.5 hours/month | ~$0.23       |
| 200 scrapes/day @ 30s each  | ~50 hours/month   | ~$3.60       |
| 500 scrapes/day @ 30s each  | ~125 hours/month  | ~$10.35      |
| 1000 scrapes/day @ 30s each | ~250 hours/month  | ~$21.60      |

Plus concurrent browser costs if using Workers bindings ($2/month per browser beyond the 10 included).

CF pricing is dramatically cheaper than self-hosted browser cluster at any volume.

---

## Recommended Approach: Hybrid Migration

### Phase 1 - Replace Simple Scraping (REST API)

- Use `/markdown` for "fast mode" chat scraping path (currently uses Readability)
- Use `/snapshot` for screenshot + HTML capture on single pages
- Use `/links` for link discovery
- Keep Temporal for crawl orchestration but remove browser pool management
- **Eliminates**: `browser-pool-manager.ts`, `browser-stealth.ts` (for non-stealth paths), most of `web-scraper-pooled.ts`

### Phase 2 - Evaluate Bot Blocking Impact

- Test CF Browser Rendering against the most-scraped domains
- If >80% of sites work without stealth, consider broader adoption
- For sites that block CF, keep fallback to self-hosted Playwright with stealth

### Phase 3 - Replace Crawl Orchestration Page Operations

- Keep Temporal (or consider Cloudflare Queues) for crawl orchestration
- Replace individual page scraping activities with CF REST API calls
- Implement progress tracking on Chipp's side (CF doesn't provide this)

### Phase 4 - Consider Workers Bindings for Advanced Cases

- Interactive element expansion via Workers + Puppeteer
- Session-persistent workflows via Durable Objects
- Requires deploying Cloudflare Workers (new infra, but fully managed)

---

## Key Risks

| Risk                            | Severity   | Mitigation                                                                                                         |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Bot detection blocking          | **High**   | Test against top-scraped domains before committing. Keep self-hosted stealth fallback.                             |
| Rate limits bottleneck          | Medium     | 180 req/min REST, 30 concurrent browsers. Request higher limits from CF if needed.                                 |
| Vendor lock-in                  | Medium     | Wrap CF API calls in an adapter interface. CF's REST API is simple HTTP, not deeply coupled.                       |
| No crawl primitives             | Medium     | Keep Temporal for orchestration. CF replaces the browser, not the workflow.                                        |
| LLM cleaning quality            | Low-Medium | CF `/markdown` is generic. Keep Gemini pipeline for RAG-optimized content. Test `/json` for structured extraction. |
| PredictionGuard incompatibility | Low        | Only affects air-gapped enterprise. Those deployments keep self-hosted path.                                       |

---

## References

- [Cloudflare Browser Rendering Overview](https://developers.cloudflare.com/browser-rendering/)
- [REST API Documentation](https://developers.cloudflare.com/browser-rendering/rest-api/)
- [API Reference](https://developers.cloudflare.com/api/resources/browser_rendering/)
- [Pricing](https://developers.cloudflare.com/browser-rendering/platform/pricing/)
- [Limits](https://developers.cloudflare.com/browser-rendering/platform/limits/)
- [Puppeteer Fork](https://developers.cloudflare.com/browser-rendering/puppeteer/)
- [Session Reuse](https://developers.cloudflare.com/browser-rendering/workers-bindings/reuse-sessions/)
- [Durable Objects Integration](https://developers.cloudflare.com/browser-rendering/workers-bindings/browser-rendering-with-do/)
- [FAQ](https://developers.cloudflare.com/browser-rendering/faq/)
- [Changelog](https://developers.cloudflare.com/browser-rendering/changelog/)
