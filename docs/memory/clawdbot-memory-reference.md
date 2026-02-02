# Clawdbot Memory System - Reference Architecture

Reference analysis of Clawdbot's persistent memory system for informing Chipp's memory implementation. Clawdbot is an open-source (MIT) personal AI assistant that runs locally with 24/7 context retention across sessions.

Source: "How Clawdbot Remembers Everything" by Manthan Gupta (manthanguptaa.in)

## Key Architectural Principles

1. **Transparency over black boxes** - Memory is plain Markdown files. Users can read, edit, and version-control it.
2. **Search over injection** - Agent searches for relevant memories rather than stuffing everything into context. Keeps costs down and context focused.
3. **Persistence over session** - Important info is saved to disk files before compaction can destroy it.
4. **Hybrid over pure** - Vector search alone misses exact matches; keyword search alone misses semantics. Both together cover the gaps.

## Context vs Memory Distinction

| Aspect     | Context                         | Memory           |
| ---------- | ------------------------------- | ---------------- |
| Lifespan   | Single request                  | Indefinite       |
| Bounded    | By context window (200K tokens) | Unbounded (disk) |
| Cost       | Every token costs API spend     | Free to store    |
| Searchable | No (linear scan)                | Yes (indexed)    |

```
Context = System Prompt + Conversation History + Tool Results + Attachments
Memory  = MEMORY.md + memory/*.md + Session Transcripts (on disk, indexed)
```

## Two-Layer Memory Storage

All memory is plain Markdown in the agent workspace:

```
~/clawd/
├── MEMORY.md              # Layer 2: Long-term curated knowledge
└── memory/
    ├── 2026-01-26.md      # Layer 1: Today's daily log
    ├── 2026-01-25.md      # Yesterday
    └── ...
```

### Layer 1: Daily Logs (`memory/YYYY-MM-DD.md`)

Append-only daily notes. Agent writes here throughout the day when it wants to remember something or is explicitly told to.

```markdown
# 2026-01-26

## 10:30 AM - API Discussion

Discussed REST vs GraphQL with user. Decision: use REST for simplicity.

## 2:15 PM - Deployment

Deployed v2.3.0 to production. No issues.

## 4:00 PM - User Preference

User mentioned they prefer TypeScript over JavaScript.
```

### Layer 2: Long-term Memory (`MEMORY.md`)

Curated persistent knowledge. Agent writes here for significant events, decisions, opinions, and lessons learned.

```markdown
# Long-term Memory

## User Preferences

- Prefers TypeScript over JavaScript
- Likes concise explanations

## Important Decisions

- 2026-01-15: Chose PostgreSQL for database
- 2026-01-20: Adopted REST over GraphQL

## Key Contacts

- Alice (alice@acme.com) - Design lead
```

### How the Agent Knows What to Read

Bootstrap instructions (in AGENTS.md, loaded every session) tell the agent:

1. Read today's and yesterday's daily logs for recent context
2. Read MEMORY.md for long-term context (in main sessions)
3. Do this silently before doing anything else

### How the Agent Writes

No dedicated memory_write tool. The agent uses standard file write/edit tools. Since memory is just Markdown, users can manually edit files too - they get re-indexed automatically.

The decision of _what_ to write and _where_ is prompt-driven via instructions in the agent config.

## Memory Indexing Pipeline

When a memory file is saved:

```
File Saved
    │
    ▼
File Watcher (Chokidar, 1.5s debounce)
    │
    ▼
Chunking (~400 tokens per chunk, 80 token overlap)
    │
    ▼
Embedding (OpenAI text-embedding-3-small → 1536 dimensions)
    │
    ▼
Storage (SQLite with sqlite-vec + FTS5)
```

### Chunking Parameters

- **Chunk size**: ~400 tokens (balances semantic coherence vs retrieval granularity)
- **Overlap**: 80 tokens (ensures facts spanning chunk boundaries appear in both chunks)
- Both values are configurable

### Storage Schema (SQLite)

```
Tables:
- chunks        (id, path, start_line, end_line, text, hash)
- chunks_vec    (id, embedding)           → sqlite-vec extension
- chunks_fts    (text)                    → FTS5 full-text search
- embedding_cache (hash, vector)          → avoid re-embedding unchanged content
```

sqlite-vec enables vector similarity search directly in SQLite (no external vector DB). FTS5 is SQLite's built-in full-text search engine for BM25 keyword matching.

## Hybrid Search

Two strategies run in parallel when searching memory:

1. **Vector search** (semantic) - Finds content that _means_ the same thing
2. **BM25 search** (keyword) - Finds content with exact tokens

Combined with weighted scoring:

```
finalScore = (0.7 * vectorScore) + (0.3 * textScore)
```

- **70% semantic**: Primary signal for memory recall
- **30% keyword**: Catches exact terms vectors miss (names, IDs, dates, URLs)
- **Minimum threshold**: 0.35 (results below this are filtered out)
- All weights are configurable

This ensures good results whether searching for concepts ("that database thing") or specifics ("POSTGRES_URL").

### Memory Search Tool

```json
{
  "name": "memory_search",
  "parameters": {
    "query": "What did we decide about the API?",
    "maxResults": 6,
    "minScore": 0.35
  }
}
```

Returns ranked results with path, line numbers, score, and snippet. After finding results, a `memory_get` tool reads specific lines for full context.

## Compaction (Context Window Management)

When conversation approaches the context window limit:

1. **Summarize** turns 1-N into a compact summary
2. **Keep** recent turns intact (last ~10 turns)
3. **Persist** summary to JSONL transcript on disk

Example: 180K/200K tokens → compaction → 45K/200K tokens

Compaction can be automatic (threshold-based) or manual (`/compact` command).

### Pre-Compaction Memory Flush

**Critical innovation**: Before compaction runs, a silent "memory flush" turn prompts the agent to save important info to disk.

```
Context approaching limit (75% threshold)
    │
    ▼
Silent Memory Flush Turn
  System: "Pre-compaction memory flush. Store durable
           memories now (use memory/YYYY-MM-DD.md).
           If nothing to store, reply with NO_REPLY."
  Agent: reviews conversation, writes key facts to disk
    │
    ▼
Compaction proceeds safely
  (important info already persisted to disk)
```

Configuration:

```json
{
  "compaction": {
    "reserveTokensFloor": 20000,
    "memoryFlush": {
      "enabled": true,
      "softThresholdTokens": 4000,
      "systemPrompt": "Session nearing compaction. Store durable memories now.",
      "prompt": "Write lasting notes to memory/YYYY-MM-DD.md; reply NO_REPLY if nothing to store."
    }
  }
}
```

This ensures compaction (a lossy process) can't destroy information that was already saved to persistent storage.

## Pruning (Tool Result Management)

Old tool results can be huge (50K+ chars). Pruning trims them without rewriting history.

### Soft Trim

Keep first N and last N characters of large tool results:

```json
{
  "softTrim": {
    "maxChars": 4000,
    "headChars": 1500,
    "tailChars": 1500
  }
}
```

### Hard Clear

Replace very old tool results entirely:

```json
{
  "hardClear": {
    "enabled": true,
    "placeholder": "[Old tool result content cleared]"
  }
}
```

### Cache-TTL Pruning

Detects when the API provider's prompt cache has expired (e.g., Anthropic's 5-minute TTL). When cache expires, prunes old tool results before the next request to reduce the re-cache cost.

```json
{
  "contextPruning": {
    "mode": "cache-ttl",
    "ttl": "600",
    "keepLastAssistants": 3
  }
}
```

## Session Lifecycle

Sessions reset based on configurable rules (default: daily reset). On session end:

1. Extract last N messages from ending session
2. Generate descriptive slug via LLM
3. Save to `memory/YYYY-MM-DD-slug.md`
4. New session starts with previous context searchable via memory_search

## Multi-Agent Memory Isolation

Each agent gets its own workspace and SQLite index. No cross-agent search by default.

```
~/.clawdbot/memory/
├── main.sqlite          # Index for "main" agent
└── work.sqlite          # Index for "work" agent

~/clawd/                 # "main" workspace (Markdown files)
~/clawd-work/            # "work" workspace (Markdown files)
```

Useful for separating contexts (personal WhatsApp agent vs work Slack agent).

## Search-as-Tool vs Context Injection

Clawdbot's most important architectural decision: **knowledge retrieval is a tool the model calls, not something auto-injected into every request.**

### Why This Matters

With context injection (Chipp's current approach):

```
Every request:
  1. Embed user message
  2. Vector search knowledge base
  3. Inject top N chunks into system prompt
  4. Send to LLM (paying for those tokens every turn)
```

Problems:

- **Wasted tokens**: Most messages don't need knowledge base content ("hello", "thanks", "can you make it shorter?")
- **Irrelevant context**: Embedding the latest user message may not capture what the user actually needs from the knowledge base (e.g., follow-up questions where the relevant query was 3 turns ago)
- **No model agency**: The model can't decide to search for something different than what was auto-retrieved
- **One-shot retrieval**: Only searches once per turn; can't do iterative refinement
- **Cost**: Every turn pays for embedding generation + vector search + injected chunk tokens, even when unnecessary

With search-as-tool (Clawdbot's approach):

```
Each request:
  1. Send to LLM (no knowledge injection)
  2. Model decides IF it needs knowledge
  3. Model crafts its own search query (may differ from user's message)
  4. Tool returns results
  5. Model can search again with refined query if needed
```

Benefits:

- **Model decides when to search** - No wasted retrieval on casual messages
- **Model crafts the query** - Can reformulate for better retrieval (e.g., searching for "JWT refresh token rotation" when user said "that auth thing we discussed")
- **Iterative search** - Model can search multiple times with different queries
- **Lower cost** - Only pays for knowledge tokens when actually needed
- **Better relevance** - Model has full conversation context when deciding what to search for

### Clawdbot's Tool Design

Two tools, search then read:

```
memory_search(query, maxResults, minScore)
  → Returns: [{path, startLine, endLine, score, snippet}]

memory_get(path, from, lines)
  → Returns: {path, text}  (full content of matched section)
```

The two-step design is intentional:

1. **Search** returns lightweight snippets with scores (cheap to include in context)
2. **Get** retrieves full content only for the chunks the model deems relevant (avoids pulling in everything)

### Chipp Equivalent

For Chipp, the knowledge base equivalent would be:

```
searchKnowledge(query, limit)     ← Already exists in chipp-deno
  → Returns: [{id, content, fileName, similarity}]

readDocument(knowledgeSourceId)   ← Planned in hybrid-rag-implementation.md
  → Returns: full document text
```

The `searchKnowledge` tool already exists (`src/agent/tools/index.ts:53-74`). The change is to **stop auto-injecting RAG context into the system prompt** and rely solely on the tool.

## Applicability to Chipp

### What Chipp Already Has

Per `docs/memory/backend-memory-extraction-architecture.md`:

- Queue-based async extraction from chat sessions
- GPT-4o-powered memory extraction with categories
- UserMemory + MemoryOrigin + MemoryPolicy tables
- Per-app configuration

Per `docs/conversational-memory-retrieval/README.md`:

- Session compression design (not yet implemented)
- Structured summary storage schema
- RAG / injection / hybrid retrieval modes planned

### Gaps Clawdbot Fills

| Gap                          | Clawdbot's Approach                                                | Chipp Adaptation                                                               |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Auto-injection waste**     | Knowledge search is a tool, not auto-injected                      | Remove system prompt RAG injection; rely on `searchKnowledge` tool exclusively |
| **No retrieval in chat**     | Hybrid search (vector 70% + BM25 30%) with minimum score threshold | Add BM25 keyword matching to `searchKnowledge` tool                            |
| **No pre-compaction safety** | Memory flush before compaction saves important info to disk        | Before session compression, extract and persist key memories first             |
| **No two-layer separation**  | Daily logs (raw, append-only) vs curated long-term memory          | Distinguish raw per-session memories from curated cross-session knowledge      |
| **Static extraction**        | File watcher + automatic re-indexing on changes                    | Re-embed memories when they're updated or consolidated                         |
| **Chunking strategy**        | 400 tokens, 80 overlap for memory files                            | Apply similar chunking to stored memory records                                |
| **Session end hooks**        | Auto-save session context on `/new` or session reset               | Hook into session end detection in ChatSessionQueue                            |

### Implementation Priority (Recommended)

1. **Ditch RAG injection, go tool-only** - Remove `getRAGContext()` from the chat flow. Stop injecting chunks into system prompt. The `searchKnowledge` tool already exists - make it the sole retrieval path. See `docs/memory/knowledge-search-tool-migration.md`.
2. **Improve `searchKnowledge` tool** - Add hybrid search (vector + BM25), better descriptions so the model knows when to use it, and a two-step search-then-read pattern.
3. **Add `readDocument` tool** - Let the model read full documents when snippets aren't enough (already planned in `hybrid-rag-implementation.md`).
4. **Add `searchMemory` tool** - Separate tool for user memories (preferences, facts) vs knowledge base content.
5. **Pre-compaction flush** - Before session compression runs, ensure key facts are extracted and stored.
6. **Two-layer memory** - Separate raw session summaries from curated cross-session knowledge.
7. **Configurable search weights** - Let app builders tune vector vs keyword balance per app.

### Key Parameters to Make Configurable

| Parameter       | Clawdbot Default | Description                          |
| --------------- | ---------------- | ------------------------------------ |
| Chunk size      | 400 tokens       | Size of memory chunks for indexing   |
| Chunk overlap   | 80 tokens        | Overlap between adjacent chunks      |
| Vector weight   | 0.7              | Weight for semantic similarity       |
| Keyword weight  | 0.3              | Weight for BM25 keyword match        |
| Min score       | 0.35             | Threshold for filtering results      |
| Max results     | 6                | Number of memory results to return   |
| Flush threshold | 75% of context   | When to trigger pre-compaction flush |
| Reserve tokens  | 20,000           | Tokens to keep free after compaction |
