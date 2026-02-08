# Cloudflare AI Search Investigation

**Date:** 2026-02-08
**Status:** Investigated, not recommended for current use
**Decision:** Keep current RAG pipeline, simplify ops with Deno.cron job queue

## Summary

Cloudflare AI Search (formerly AutoRAG) is a fully managed RAG pipeline that automatically indexes files from R2 buckets or websites. While the zero-ops appeal is strong, several deal-breakers make it unsuitable as a replacement for our knowledge source system.

## What It Is

Upload files to R2 or point it at a website, and it automatically:
1. Converts files to markdown (PDF, DOCX, XLSX, HTML, images, code)
2. Chunks using recursive splitting (64-512 tokens, configurable)
3. Embeds with your choice of model (BGE-m3, OpenAI text-embedding-3-small/large, Gemini)
4. Stores vectors in Cloudflare Vectorize
5. Exposes two REST endpoints: `/ai-search` (chunks + LLM answer) and `/search` (raw chunks only)

Queryable from any backend via REST API with bearer token -- no need to use Workers.

## Quality Comparison

| Aspect | Our Current System | Cloudflare AI Search |
|--------|-------------------|---------------------|
| Chunking | LlamaParse semantic (understands doc structure) | Recursive (paragraph/sentence boundaries) |
| Embedding model | BGE-base-en-v1.5 local (768d padded to 3072) | BGE-m3 or OpenAI text-embedding-3-large |
| Search type | Cosine similarity on chunks | Cosine similarity on chunks |
| Document summaries | Planned (not implemented) | None |
| Hybrid scoring | Planned (not implemented) | None (no BM25/keyword) |
| Reranking | None | Optional BGE reranker (512 token limit) |
| Query rewriting | None | Optional LLM-based (+1.7s latency) |

**Assessment:** Our current search is basic cosine similarity with a 0.15 threshold and top-5. The hybrid search plan in `docs/hybrid-rag-implementation.md` isn't implemented yet. Cloudflare would be roughly equivalent or slightly better today due to their reranker and stronger embedding models. If we implement hybrid search, we'd pull ahead.

## Deal-Breakers

### 1. Website crawling only works for domains on YOUR Cloudflare account
Our customers upload arbitrary URLs -- random websites, company docs, competitor pages. AI Search can only crawl domains onboarded to our CF account, and requires a sitemap. This kills the URL scraping use case.

### 2. Multi-tenancy is fragile
One instance holds up to 100K files. Isolation is folder-based metadata filtering at query time:
```json
{ "filters": { "type": "eq", "key": "folder", "value": "app_123/" } }
```
A filter bug = data leak. No true namespace isolation. 100K shared across all tenants.

### 3. Max 10 instances per account
Scaling to hundreds of apps with thousands of documents each gets tight.

### 4. 4MB max file size
Hard limit. Our users may upload larger files.

### 5. Still in open beta (as of Feb 2026)
No SLA. Users report 6+ hour indexing delays. Limits "subject to change."

### 6. Embedding model locked at creation
Pick wrong, recreate the entire instance.

## What It Would Save

If the deal-breakers didn't exist:
- Kill Temporal entirely
- Kill LlamaParse, Firecrawl, GCS dependencies
- Kill pgvector maintenance / unbounded `rag.text_chunks` growth
- Kill the entire ingestion pipeline (5+ service files)
- No more failed processing jobs or stuck uploads

## Pricing

| Component | Current Cost | With AI Search |
|-----------|-------------|----------------|
| LlamaParse | ~$0.003/page | $0 (included) |
| Firecrawl | ~$0.01/URL | $0 for own domains, N/A for customer URLs |
| GCS storage | ~$0.02/GB/month | R2: $0.015/GB/month |
| Embeddings (local BGE) | $0 (CPU time) | Workers AI tokens (varies) |
| pgvector | Included in DB | Vectorize (included) |
| Temporal | Infrastructure cost | $0 |

## Recommended Path Forward

### Instead of AI Search, simplify the existing pipeline:

1. **Drop Temporal** -- Replace with Deno.cron job queue for bulk upload processing
2. **Keep LlamaParse** -- Its semantic chunking is genuinely better than recursive
3. **Keep Firecrawl** -- Handles arbitrary URL crawling that AI Search can't
4. **Keep pgvector** -- Already works, co-located with app data
5. **Implement hybrid search** -- Document summaries + chunk similarity from existing plan

### Future reconsideration triggers:
- AI Search adds arbitrary URL crawling (not just owned domains)
- True namespace isolation added
- GA release with SLAs
- File limits increased significantly

### Possible narrow use:
Use AI Search for indexing our own help docs/documentation (domain we control). Evaluate quality in production without risk to customer features.

## Sources

- [Cloudflare AI Search Docs](https://developers.cloudflare.com/ai-search/)
- [Introducing AutoRAG Blog](https://blog.cloudflare.com/introducing-autorag-on-cloudflare/)
- [AI Search Limits & Pricing](https://developers.cloudflare.com/ai-search/platform/limits-pricing/)
- [AI Search REST API](https://developers.cloudflare.com/ai-search/usage/rest-api/)
- [How AI Search Works](https://developers.cloudflare.com/ai-search/concepts/how-ai-search-works/)
- [Multi-tenancy Guide](https://developers.cloudflare.com/ai-search/how-to/multitenancy/)
- [Website Data Source](https://developers.cloudflare.com/ai-search/configuration/data-source/website/)
