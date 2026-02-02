# Production Data Migration

This directory contains scripts to migrate data from the existing 3-database architecture
to the new consolidated PostgreSQL database.

## Source Databases

1. **MySQL Main (DATABASE_URL)** - Core application data

   - Developer, Organization, Application, Consumer, etc.
   - ~170+ models

2. **MySQL Chat (CHAT_DATABASE_URL)** - Conversation data

   - ChatSession, Message, File, UserMemory, WhatsAppConfig
   - ~10 models

3. **PostgreSQL Embeddings (PG_DATABASE_URL)** - RAG/vector data
   - textchunk, document_embeddings, knowledge sources
   - ~30+ models with pgvector

## Target Database

Single PostgreSQL database with schemas:

- `app.*` - Users, organizations, applications, consumers
- `chat.*` - Sessions, messages, memories
- `rag.*` - Knowledge sources, text chunks with embeddings
- `billing.*` - Token usage, credit transactions
- `jobs.*` - Background job tracking

## Migration Strategy

1. **ID Mapping**: Old INT IDs → New UUIDs

   - Maintain mapping tables during migration
   - Update all foreign key references

2. **Order of Operations**:

   - Organizations first (billing entities)
   - Users (developers)
   - Applications
   - Consumers
   - Chat sessions & messages
   - Knowledge sources & embeddings
   - Billing data

3. **Batch Processing**:
   - 1000 rows per batch to manage memory
   - Progress tracking and resumability

## Running the Migration

```bash
# Set environment variables
export DATABASE_URL="mysql://..." # Old main DB
export CHAT_DATABASE_URL="mysql://..." # Old chat DB
export PG_DATABASE_URL="postgresql://..." # Old embeddings DB
export DENO_DATABASE_URL="postgresql://..." # New consolidated DB

# Test mode (10 records per phase - quick sanity check)
deno task migrate:data:test

# Dry run (shows what would happen without making changes)
deno task migrate:data:dry-run

# Run single phase with limit
deno task migrate:data -- --phase=1 --limit=100

# Full migration
deno task migrate:data

# Resume after interruption
deno task migrate:data -- --resume
```

## Safety

- **Read-only** from source databases
- **Idempotent** - can be re-run safely
- **Resumable** - tracks progress in target DB
- **Dry-run mode** available for testing
