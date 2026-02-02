# Hybrid RAG Implementation for chipp-deno

This document outlines how to implement hybrid search and document-level features in chipp-deno, matching the capabilities in chipp-admin.

## Current State

chipp-deno has basic RAG with chunk-level similarity search only:

```
User Query → Embed → Cosine Similarity → Top N Chunks → Context
```

## Target State

Hybrid RAG with document-level relevance boosting:

```
User Query → Embed → Document Relevance (summaries)
                  → Chunk Similarity
                  → Combined Ranking
                  → Top N Chunks → Context

+ readDocument Tool → Full Document Access (Gemini large context)
```

## Features to Implement

### 1. Document Embeddings Table

Add a new table for document-level summaries and embeddings:

```sql
-- Migration: add_document_embeddings.sql
CREATE TABLE rag.document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_source_id UUID NOT NULL REFERENCES rag.knowledge_sources(id) ON DELETE CASCADE,
    application_id UUID NOT NULL,
    file_name TEXT NOT NULL,
    summary TEXT,
    full_text TEXT,
    embedding vector(3072),
    embedding_provider VARCHAR(50),
    embedding_model VARCHAR(100),
    parent_knowledge_source_id UUID,  -- For multi-page docs split into sections
    section_number INTEGER,
    total_sections INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_application FOREIGN KEY (application_id)
        REFERENCES app.applications(id) ON DELETE CASCADE
);

CREATE INDEX idx_doc_embeddings_app_id ON rag.document_embeddings(application_id);
CREATE INDEX idx_doc_embeddings_ks_id ON rag.document_embeddings(knowledge_source_id);
CREATE UNIQUE INDEX idx_doc_embeddings_file_unique ON rag.document_embeddings(knowledge_source_id);

-- HNSW index for vector search (uses halfvec for 3072 dimensions)
CREATE INDEX idx_doc_embeddings_hnsw ON rag.document_embeddings
    USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);
```

### 2. Summary Generation During Ingestion

Update `rag-ingestion.service.ts` to generate document summaries:

```typescript
// In processDocument():

// After extracting text, generate summary
const summary = await generateDocumentSummary(fullText, fileName);

// Generate embedding for the summary
const summaryEmbedding = await embeddingProvider.generate(summary);

// Store in document_embeddings table
await sql`
  INSERT INTO rag.document_embeddings (
    knowledge_source_id,
    application_id,
    file_name,
    summary,
    full_text,
    embedding,
    embedding_provider,
    embedding_model
  ) VALUES (
    ${knowledgeSourceId}::uuid,
    ${applicationId}::uuid,
    ${fileName},
    ${summary},
    ${fullText},
    ${formatEmbeddingForPg(summaryEmbedding.embedding)}::vector,
    ${summaryEmbedding.provider},
    ${summaryEmbedding.model}
  )
`;
```

### 3. Summary Generation Service

Create a service to generate document summaries:

```typescript
// src/services/document-summary.service.ts

import OpenAI from "openai";

const SUMMARY_PROMPT = `Summarize this document in 2-3 sentences that capture the main topic,
key entities, and purpose. Focus on what makes this document unique and searchable.

Document:
{text}

Summary:`;

export async function generateDocumentSummary(
  fullText: string,
  fileName: string
): Promise<string> {
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

  // Truncate if needed (GPT-4 has 128k context but we want fast responses)
  const maxChars = 50000;
  const truncatedText =
    fullText.length > maxChars
      ? fullText.slice(0, maxChars) + "...[truncated]"
      : fullText;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: SUMMARY_PROMPT.replace("{text}", truncatedText),
      },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });

  return response.choices[0].message.content || `Document: ${fileName}`;
}
```

### 4. Hybrid Search Implementation

Update `rag.service.ts` to use hybrid search:

```typescript
// src/services/rag.service.ts

interface HybridSearchOptions {
  applicationId: string;
  userMessage: string;
  documentWeight?: number; // 0-1, default 0.3
  maxChunks?: number;
}

export async function hybridSearch(
  options: HybridSearchOptions
): Promise<RelevantChunk[]> {
  const {
    applicationId,
    userMessage,
    documentWeight = 0.3,
    maxChunks = 5,
  } = options;

  // Generate query embedding
  const { embedding } = await generateLocalEmbedding(userMessage);
  const embeddingStr = formatEmbeddingForPg(embedding);

  // Step 1: Find relevant documents based on summaries
  const relevantDocs = await sql`
    SELECT
      knowledge_source_id,
      file_name,
      summary,
      1 - (embedding <=> ${embeddingStr}::vector) as doc_similarity
    FROM rag.document_embeddings
    WHERE application_id = ${applicationId}::uuid
      AND embedding IS NOT NULL
    ORDER BY doc_similarity DESC
    LIMIT 10
  `;

  // Create document relevance map
  const docScores = new Map<string, number>();
  for (const doc of relevantDocs) {
    if (doc.doc_similarity > 0.3) {
      docScores.set(doc.knowledge_source_id, doc.doc_similarity);
    }
  }

  // Step 2: Search chunks with document boosting
  const chunks = await sql`
    SELECT
      tc.id,
      tc.content,
      tc.metadata,
      tc.knowledge_source_id,
      ks.name as file_name,
      1 - (tc.embedding <=> ${embeddingStr}::vector) as chunk_similarity
    FROM rag.text_chunks tc
    LEFT JOIN rag.knowledge_sources ks ON tc.knowledge_source_id = ks.id
    WHERE tc.application_id = ${applicationId}::uuid
      AND tc.embedding IS NOT NULL
    ORDER BY chunk_similarity DESC
    LIMIT ${maxChunks * 3}
  `;

  // Step 3: Re-rank with hybrid scoring
  const rankedChunks = chunks.map((chunk) => {
    const docScore = docScores.get(chunk.knowledge_source_id) || 0;
    const hybridScore =
      chunk.chunk_similarity * (1 - documentWeight) + docScore * documentWeight;

    return {
      ...chunk,
      hybridScore,
    };
  });

  // Sort by hybrid score and return top N
  return rankedChunks
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, maxChunks)
    .map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      fileName: chunk.file_name,
      fileId: chunk.knowledge_source_id,
      similarity: chunk.hybridScore,
      metadata: chunk.metadata,
    }));
}
```

### 5. Read Document Tool

Add a tool for reading full documents with Gemini's large context:

```typescript
// src/services/chat/tools/read-document.tool.ts

import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(Deno.env.get("GOOGLE_API_KEY") || "");

export const readDocumentTool = {
  name: "readDocument",
  description: `Read a knowledge base document using a large context window.
    Use the document number (1, 2, 3) shown in knowledge base context.
    Call this for EVERY new question about a document.`,

  parameters: z.object({
    documentIndex: z
      .number()
      .int()
      .positive()
      .describe("Document number from knowledge base (1, 2, 3, etc.)"),
    query: z
      .string()
      .describe("The specific question to answer from this document"),
  }),

  execute: async ({
    documentIndex,
    query,
    applicationId,
    knowledgeSourceIds,
  }) => {
    // Get the document by index
    const ksId = knowledgeSourceIds[documentIndex - 1];
    if (!ksId) {
      return { error: `Document ${documentIndex} not found` };
    }

    // Fetch full text
    const [doc] = await sql`
      SELECT full_text, file_name
      FROM rag.document_embeddings
      WHERE knowledge_source_id = ${ksId}::uuid
    `;

    if (!doc?.full_text) {
      return { error: "Document text not available" };
    }

    // Use Gemini for large context analysis
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Based on the following document, answer this question:
Question: ${query}

Document "${doc.file_name}":
${doc.full_text}

Provide ONLY relevant verbatim quotes formatted as <CONTENT>...</CONTENT>.
Do not summarize - quote directly from the document.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    return {
      documentName: doc.file_name,
      relevantContent: response,
    };
  },
};
```

### 6. Document Index for Chat Context

Track which documents are available in chat context:

```typescript
// src/services/chat/document-index.ts

const documentIndexStore = new Map<string, string[]>(); // chatSessionId -> [ksId1, ksId2, ...]

export function setDocumentIndex(
  chatSessionId: string,
  knowledgeSourceIds: string[]
): void {
  documentIndexStore.set(chatSessionId, knowledgeSourceIds);
}

export function getKnowledgeSourceIdByIndex(
  chatSessionId: string,
  index: number
): string | null {
  const ids = documentIndexStore.get(chatSessionId);
  return ids?.[index - 1] || null;
}

export function formatContextWithIndex(chunks: RelevantChunk[]): string {
  // Group chunks by knowledge source
  const bySource = new Map<string, RelevantChunk[]>();
  for (const chunk of chunks) {
    const existing = bySource.get(chunk.fileId!) || [];
    existing.push(chunk);
    bySource.set(chunk.fileId!, existing);
  }

  // Format with document numbers
  let context = "## Knowledge Base\n\n";
  let docIndex = 1;
  const knowledgeSourceIds: string[] = [];

  for (const [ksId, docChunks] of bySource) {
    knowledgeSourceIds.push(ksId);
    context += `### [${docIndex}] ${docChunks[0].fileName}\n`;
    for (const chunk of docChunks) {
      context += `${chunk.content}\n\n`;
    }
    docIndex++;
  }

  return { context, knowledgeSourceIds };
}
```

## Migration Checklist

- [ ] Create `rag.document_embeddings` table migration
- [ ] Implement `generateDocumentSummary()` service
- [ ] Update RAG ingestion to create document summaries
- [ ] Implement hybrid search in `rag.service.ts`
- [ ] Add `readDocument` tool to chat tools
- [ ] Implement document index tracking
- [ ] Update chat context formatting with document numbers
- [ ] Backfill existing knowledge sources with summaries

## Backfill Script

For existing documents without summaries:

```typescript
// scripts/backfill-document-summaries.ts

const pendingDocs = await sql`
  SELECT ks.id, ks.name, ks.application_id
  FROM rag.knowledge_sources ks
  LEFT JOIN rag.document_embeddings de ON de.knowledge_source_id = ks.id
  WHERE de.id IS NULL
    AND ks.status = 'completed'
`;

for (const doc of pendingDocs) {
  // Get all chunks to reconstruct full text
  const chunks = await sql`
    SELECT content FROM rag.text_chunks
    WHERE knowledge_source_id = ${doc.id}::uuid
    ORDER BY metadata->>'chunkIndex'
  `;

  const fullText = chunks.map((c) => c.content).join("\n\n");
  const summary = await generateDocumentSummary(fullText, doc.name);
  const embedding = await embeddingProvider.generate(summary);

  await sql`
    INSERT INTO rag.document_embeddings (...)
    VALUES (...)
  `;
}
```

## Performance Considerations

1. **Summary generation** adds ~1-2s per document during ingestion
2. **Hybrid search** adds one extra query (~10ms) for document relevance
3. **readDocument tool** uses Gemini which has ~2s latency but handles 1M token context
4. **Full text storage** increases database size significantly

## Integration with Temporal (Future)

When integrating with Temporal:

- Summary generation becomes an activity with retry logic
- Full text is stored during `fileRagWorkflow`
- Backfill can run as a scheduled workflow
