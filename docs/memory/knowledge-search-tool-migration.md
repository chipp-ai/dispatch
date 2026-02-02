# Knowledge Search: RAG Injection → Tool-Based Retrieval

Migration plan for removing automatic RAG context injection and making knowledge search a standalone tool the model calls on demand.

## Current State

chipp-deno does **both** simultaneously:

1. **System prompt injection** (`getRAGContext()`) - Every chat request embeds the user message, runs vector search, and injects top chunks into the system prompt. Runs even for messages like "thanks" or "ok".
2. **`searchKnowledge` tool** - Registered in the tool registry, model can call it explicitly. Already works.

### Current Flow

```
User message arrives
    │
    ├── getRAGContext(appId, message)        ← REMOVE THIS
    │     embed message → vector search → format chunks
    │     result appended to system prompt
    │
    ├── [other parallel context: history, memories, credits]
    │
    ▼
Build messages array
    system prompt includes RAG chunks      ← STOP DOING THIS
    │
    ▼
Stream response with tool registry
    tools include searchKnowledge           ← KEEP THIS (improve it)
```

### Files Involved

| File                                      | What it does                                                         | Change needed                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/services/rag.service.ts`             | `getRAGContext()`, `getRelevantChunks()`, `buildRAGContextMessage()` | Keep `getRelevantChunks()`, remove `getRAGContext()` and `buildRAGContextMessage()` |
| `src/api/routes/chat/index.ts:554-555`    | Injects `ragContext.contextMessage` into system prompt               | Remove injection                                                                    |
| `src/api/routes/chat/index.ts:1301-1302`  | Same injection in completions endpoint                               | Remove injection                                                                    |
| `src/api/routes/consumer/chat.ts:408-409` | Same injection in consumer chat                                      | Remove injection                                                                    |
| `src/api/routes/consumer/chat.ts:777-778` | Same injection in consumer completions                               | Remove injection                                                                    |
| `src/agent/tools/index.ts:53-74`          | `registerRAGTools()` - existing `searchKnowledge` tool               | Improve description and add hybrid search                                           |

## Target State

```
User message arrives
    │
    ├── [parallel context: history, memories, credits]
    │   (NO RAG retrieval here)
    │
    ▼
Build messages array
    system prompt: base prompt + memories only (no RAG)
    │
    ▼
Stream response with tool registry
    tools include:
      searchKnowledge(query, limit)     ← model calls when it needs info
      readDocument(knowledgeSourceId)    ← model calls for full document
```

## Migration Steps

### Step 1: Improve the `searchKnowledge` tool

The current tool has a generic description. The model needs clear guidance on when to use it.

**Current:**

```typescript
registry.register({
  name: "searchKnowledge",
  description: "Search the knowledge base for relevant information",
  parameters: z.object({
    query: z.string().describe("The search query"),
    limit: z.number().default(5).describe("Maximum results to return"),
  }),
});
```

**Target:**

```typescript
registry.register({
  name: "searchKnowledge",
  description:
    "Search the knowledge base for information from uploaded documents, " +
    "websites, and files. Use this tool whenever the user asks a question " +
    "that might be answered by the knowledge base, or when you need to " +
    "verify facts. You can search multiple times with different queries " +
    "to find the best answer. Prefer specific queries over broad ones.",
  parameters: z.object({
    query: z
      .string()
      .describe(
        "Semantic search query. Be specific. " +
          "Example: 'refund policy for annual subscriptions' " +
          "not 'refund policy'"
      ),
    limit: z.number().default(5).describe("Maximum results to return"),
  }),
});
```

### Step 2: Add system prompt instruction

Tell the model about its knowledge base in the system prompt (without injecting actual chunks):

```
You have access to a knowledge base through the searchKnowledge tool.
When the user asks questions that might be covered by your knowledge base,
use searchKnowledge to find relevant information before answering.
You can search multiple times with different queries if the first results
aren't sufficient.
```

This replaces the chunk injection. The model knows it has a knowledge base and will call the tool when needed.

Only add this instruction when the app actually has knowledge sources (check chunk count > 0, which `rag.service.ts` already does).

### Step 3: Remove RAG injection from chat routes

Remove the `getRAGContext()` calls and `ragContext.contextMessage` injection from:

- `src/api/routes/chat/index.ts` (2 locations: lines 554-555, 1301-1302)
- `src/api/routes/consumer/chat.ts` (2 locations: lines 408-409, 777-778)

Remove the parallel `ragPromise` from the Promise.all calls.

Keep the `getRelevantChunks()` function in `rag.service.ts` - the `searchKnowledge` tool uses it.

### Step 4: Add hybrid search to `getRelevantChunks()`

Following Clawdbot's approach, add BM25 keyword matching alongside vector search:

```
finalScore = (0.7 * vectorScore) + (0.3 * bm25Score)
```

PostgreSQL has `pg_trgm` for trigram similarity and `tsvector`/`tsquery` for full-text search. Either can serve as the keyword component.

### Step 5 (future): Add `readDocument` tool

Let the model read full documents when snippets aren't enough. Already planned in `hybrid-rag-implementation.md`.

## What About Citations?

Current citation system (`[[TextChunkId]]`) works through system prompt injection. With tool-based search, citations still work because:

1. `searchKnowledge` returns chunk IDs and content
2. The model sees the chunk IDs in the tool result
3. The model can cite `[[TextChunkId]]` in its response

The citation instructions should move from `buildRAGContextMessage()` into either:

- The `searchKnowledge` tool result (prepend instructions to the response)
- The system prompt (static instruction about how to cite)

## Risks

| Risk                                         | Mitigation                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Model doesn't call tool when it should       | Good tool description + system prompt hint + testing                        |
| Latency increase (tool call round-trip)      | Only matters when tool IS called; saves latency on all turns where it isn't |
| Regression for apps heavily dependent on RAG | Feature flag to roll out gradually; A/B test quality                        |
| Citation format changes                      | Move citation instructions to system prompt                                 |

## Feature Flag Recommendation

Roll this out behind a per-app flag:

```typescript
// In application settings or a feature flag
knowledgeRetrievalMode: "injection" | "tool"; // default: "injection" initially
```

This allows gradual migration and A/B testing quality differences per app.
