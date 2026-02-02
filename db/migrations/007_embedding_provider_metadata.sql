-- Migration: 007_embedding_provider_metadata
-- Description: Add embedding provider metadata columns and expand vector dimension
-- Created: 2024-12-20
--
-- Supports dynamic embedding providers by:
-- 1. Expanding vector(1536) to vector(3072) for max dimensions (OpenAI text-embedding-3-large)
-- 2. Adding metadata columns to track actual provider/model/dimensions used
-- 3. Smaller embeddings (e.g., 768 for BGE) work in larger vector columns
--
-- IMPORTANT: Switching embedding providers requires re-uploading all knowledge sources
-- because embeddings from different providers are not comparable.

-- ============================================================
-- Add embedding metadata columns to rag.text_chunks
-- ============================================================

ALTER TABLE rag.text_chunks
  ADD COLUMN IF NOT EXISTS embedding_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN rag.text_chunks.embedding_provider IS 'Provider used: local, openai, predictionguard, custom';
COMMENT ON COLUMN rag.text_chunks.embedding_model IS 'Model ID used for embedding, e.g., Xenova/bge-base-en-v1.5';
COMMENT ON COLUMN rag.text_chunks.embedding_dimensions IS 'Actual dimensions of the embedding vector';

-- ============================================================
-- Add embedding metadata columns to rag.document_summaries
-- ============================================================

ALTER TABLE rag.document_summaries
  ADD COLUMN IF NOT EXISTS embedding_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER;

-- ============================================================
-- Add embedding metadata columns to rag.tag_utterances
-- ============================================================

ALTER TABLE rag.tag_utterances
  ADD COLUMN IF NOT EXISTS embedding_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER;

-- ============================================================
-- Update existing data to reflect local BGE model (current default)
-- ============================================================

UPDATE rag.text_chunks
SET
  embedding_provider = 'local',
  embedding_model = 'Xenova/bge-base-en-v1.5',
  embedding_dimensions = 768
WHERE embedding IS NOT NULL
  AND embedding_provider IS NULL;

UPDATE rag.document_summaries
SET
  embedding_provider = 'local',
  embedding_model = 'Xenova/bge-base-en-v1.5',
  embedding_dimensions = 768
WHERE embedding IS NOT NULL
  AND embedding_provider IS NULL;

UPDATE rag.tag_utterances
SET
  embedding_provider = 'local',
  embedding_model = 'Xenova/bge-base-en-v1.5',
  embedding_dimensions = 768
WHERE embedding IS NOT NULL
  AND embedding_provider IS NULL;

-- ============================================================
-- Expand vector column dimensions
-- ============================================================
-- Note: We need to recreate the vector columns to change dimensions.
-- Smaller embeddings stored in a larger vector column work correctly
-- as PostgreSQL's pgvector handles dimension differences.

-- First, drop the HNSW index (it depends on the vector column)
DROP INDEX IF EXISTS rag.idx_text_chunks_embedding;

-- Recreate the embedding column with larger dimension
-- We do this by: create new column -> copy data -> drop old -> rename new
ALTER TABLE rag.text_chunks ADD COLUMN embedding_new vector(3072);

-- Copy existing embeddings (they will retain their original dimensions)
UPDATE rag.text_chunks SET embedding_new = embedding WHERE embedding IS NOT NULL;

-- Drop old column and rename new
ALTER TABLE rag.text_chunks DROP COLUMN embedding;
ALTER TABLE rag.text_chunks RENAME COLUMN embedding_new TO embedding;

-- Recreate HNSW index using halfvec cast (supports up to 16,000 dimensions)
-- Regular vector type is limited to 2000 dimensions for HNSW/IVFFlat indexes
-- halfvec (16-bit float) has negligible precision loss for similarity search
CREATE INDEX idx_text_chunks_hnsw_halfvec ON rag.text_chunks
  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Similarly for document_summaries
ALTER TABLE rag.document_summaries ADD COLUMN embedding_new vector(3072);
UPDATE rag.document_summaries SET embedding_new = embedding WHERE embedding IS NOT NULL;
ALTER TABLE rag.document_summaries DROP COLUMN embedding;
ALTER TABLE rag.document_summaries RENAME COLUMN embedding_new TO embedding;

-- Similarly for tag_utterances
ALTER TABLE rag.tag_utterances ADD COLUMN embedding_new vector(3072);
UPDATE rag.tag_utterances SET embedding_new = embedding WHERE embedding IS NOT NULL;
ALTER TABLE rag.tag_utterances DROP COLUMN embedding;
ALTER TABLE rag.tag_utterances RENAME COLUMN embedding_new TO embedding;

-- ============================================================
-- Add embedding config to applications
-- ============================================================
-- Store the default embedding configuration at the application level

ALTER TABLE app.applications
  ADD COLUMN IF NOT EXISTS embedding_config JSONB;

COMMENT ON COLUMN app.applications.embedding_config IS 'Default embedding configuration: {provider, model, dimensions, apiKey (encrypted)}';

-- ============================================================
-- Create HNSW indexes using halfvec for document_summaries and tag_utterances
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_document_summaries_hnsw_halfvec ON rag.document_summaries
  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_tag_utterances_hnsw_halfvec ON rag.tag_utterances
  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
