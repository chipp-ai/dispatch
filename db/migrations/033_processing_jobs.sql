-- Migration 033: RAG Processing Job Queue
--
-- Postgres-backed job queue for knowledge source processing.
-- Replaces fire-and-forget inline processing and the Temporal TODO.
-- Uses SELECT ... FOR UPDATE SKIP LOCKED for multi-replica safe claiming.

CREATE TABLE IF NOT EXISTS rag.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
    knowledge_source_id UUID NOT NULL REFERENCES rag.knowledge_sources(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,           -- 'file', 'url', 'crawl_page'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending/processing/completed/failed/cancelled
    priority INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    embedding_config JSONB,
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ
);

-- Claim query: find pending jobs ordered by priority desc, created_at asc
CREATE INDEX idx_processing_jobs_pending
    ON rag.processing_jobs (priority DESC, created_at ASC)
    WHERE status = 'pending';

-- Look up jobs by application
CREATE INDEX idx_processing_jobs_application_id
    ON rag.processing_jobs (application_id);

-- Look up jobs by knowledge source
CREATE INDEX idx_processing_jobs_knowledge_source_id
    ON rag.processing_jobs (knowledge_source_id);

-- Stale job detection: processing jobs with old heartbeats
CREATE INDEX idx_processing_jobs_stale
    ON rag.processing_jobs (heartbeat_at)
    WHERE status = 'processing';
