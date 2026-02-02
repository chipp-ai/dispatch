# Chipp Deno Schema Migration Plan

## Executive Summary

Migrating from 3 separate Prisma databases (124 models, 47 enums) to a unified PostgreSQL schema with Kysely. This document outlines the consolidation strategy, tech debt cleanup, and migration approach.

## Current State

| Database   | Purpose             | Models | Key Tables                                     |
| ---------- | ------------------- | ------ | ---------------------------------------------- |
| Main MySQL | Core business logic | 93     | Organization, Developer, Application, Consumer |
| Chat MySQL | Message storage     | 9      | ChatSession, Message, File                     |
| PostgreSQL | Embeddings + Issues | 22     | textchunk, document*embeddings, chipp*\*       |

## Target Architecture

### Single PostgreSQL Database with Schemas

```
chipp_deno (database)
├── app (schema)      -- Core business entities
├── chat (schema)     -- Chat sessions and messages
├── rag (schema)      -- Embeddings and knowledge sources
├── billing (schema)  -- Stripe, subscriptions, credits
└── internal (schema) -- Issue tracking, jobs, reports
```

**Benefits:**

- Single connection pool
- Cross-schema foreign keys
- Transactional consistency
- Simpler deployment
- Native vector support via pgvector

---

## Phase 1: Core Entities (Priority)

### 1.1 Organization & Workspace Consolidation

**Current confusion:** Developer, Organization, Workspace all have overlapping billing/tier concepts.

**New model:**

```sql
-- app.organizations: Top-level billing entity
CREATE TABLE app.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  picture_url TEXT,

  -- Stripe billing (single source of truth)
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_tier subscription_tier NOT NULL DEFAULT 'FREE',
  subscription_period subscription_period NOT NULL DEFAULT 'MONTHLY',

  -- Usage-based billing
  usage_based_billing_enabled BOOLEAN DEFAULT FALSE,
  credits_exhausted BOOLEAN DEFAULT FALSE,

  -- Feature flags (JSONB for flexibility)
  feature_flags JSONB DEFAULT '{}',

  -- Whitelabel
  whitelabel_tenant_id UUID REFERENCES app.whitelabel_tenants(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- app.workspaces: Project container within org
CREATE TABLE app.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  picture_url TEXT,

  -- Settings
  visibility workspace_visibility DEFAULT 'PRIVATE',
  max_seats INT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(organization_id, slug)
);
```

**Migration:**

- Developer.subscriptionTier/stripeCustomerId → Organization
- Remove DeveloperCredentials billing fields (duplicate)
- Remove WorkspaceTier enum (use org tier)

### 1.2 Users (Rename Developer → User)

**Current:** "Developer" is confusing - they're users who build chatbots.

```sql
-- app.users: Platform users (was "Developer")
CREATE TABLE app.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture_url TEXT,
  username TEXT UNIQUE,

  -- Profile
  acquisition_source TEXT,
  has_completed_onboarding BOOLEAN DEFAULT FALSE,

  -- Active context
  active_workspace_id UUID REFERENCES app.workspaces(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- NO password/auth fields - handled by auth provider
  -- NO stripe fields - billing is at org level
);

-- app.user_credentials: Separated auth data
CREATE TABLE app.user_credentials (
  user_id UUID PRIMARY KEY REFERENCES app.users(id),
  password_hash TEXT,  -- Only if local auth enabled
  email_verified BOOLEAN DEFAULT FALSE,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret TEXT
);
```

**Cleanup:**

- Remove: resetToken, resetTokenExpiry, magicLinkToken, magicLinkTokenExpiry
- Remove: stripeSubscriptionId, stripeCustomerId, stripeAccountId from Developer
- Rename: Developer → User everywhere

### 1.3 Applications (Simplify)

**Current:** Application has 60+ fields, many deprecated.

```sql
-- app.applications: AI chatbot/agent
CREATE TABLE app.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES app.workspaces(id),
  owner_id UUID NOT NULL REFERENCES app.users(id),

  -- Identity
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT,

  -- Configuration
  starting_message TEXT,
  input_placeholder TEXT,
  disclaimer_text TEXT,

  -- Publishing
  publish_state publish_state DEFAULT 'ONLY_ME',
  chat_type chat_type DEFAULT 'ChippHosted',

  -- Localization
  language language DEFAULT 'EN',
  text_direction text_direction DEFAULT 'LTR',
  currency currency DEFAULT 'USD',

  -- RAG settings
  rag_config JSONB DEFAULT '{
    "relevance_threshold": 0.7,
    "max_chunks": 10,
    "use_hybrid_search": true,
    "document_weight": 0.5
  }',

  -- Voice/Phone
  phone_number TEXT,
  default_interaction_method interaction_method DEFAULT 'CHAT',

  -- Versioning
  published_version_id UUID,
  last_published_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(workspace_id, slug)
);
```

**Removed fields:**

- `authDisabledForPlayground` - legacy
- `monetizationEnabled` - legacy
- `brandStyles` - moved to separate table
- `customDomain`, `customDomainSSLVerified` - moved to app.custom_domains
- `developerId` - renamed to `owner_id`
- `collectionId` - collections deprecated or redesigned

### 1.4 Consumers (End Users)

```sql
-- app.consumers: End users of applications
CREATE TABLE app.consumers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES app.applications(id),

  -- Identity (flexible - could be email, phone, external ID)
  identifier TEXT NOT NULL,
  identifier_type TEXT DEFAULT 'email', -- email, phone, external, anonymous

  -- Profile
  name TEXT,
  email TEXT,
  picture_url TEXT,

  -- Subscription/Credits
  subscription_active BOOLEAN DEFAULT FALSE,
  credits INT DEFAULT 0,

  -- Custom instructions (user preferences)
  custom_instructions TEXT,

  -- Environment
  mode environment_mode DEFAULT 'LIVE',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(application_id, identifier, mode)
);
```

**Removed:**

- Password/auth fields - use consumer_credentials if needed
- stripeCustomerId - consumer billing handled differently

---

## Phase 2: Chat Schema

### 2.1 Sessions & Messages

```sql
-- chat.sessions
CREATE TABLE chat.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL, -- Cross-schema reference
  consumer_id UUID,

  -- Source info
  source chat_source NOT NULL DEFAULT 'APP',
  phone_number TEXT, -- For WhatsApp/Voice

  -- Display
  title TEXT,
  is_public BOOLEAN DEFAULT FALSE,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_app_updated ON chat.sessions(application_id, updated_at DESC);
CREATE INDEX idx_sessions_consumer ON chat.sessions(consumer_id) WHERE consumer_id IS NOT NULL;

-- chat.messages
CREATE TABLE chat.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat.sessions(id),

  -- Content
  sender_type sender_type NOT NULL,
  sender_id TEXT, -- User ID or 'bot'
  content TEXT NOT NULL,
  content_type message_type DEFAULT 'TEXT',

  -- AI details
  model_used TEXT,

  -- Tags (denormalized for query performance)
  tag_ids UUID[] DEFAULT '{}',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON chat.messages(session_id, created_at);
CREATE INDEX idx_messages_fulltext ON chat.messages USING gin(to_tsvector('english', content));

-- chat.message_files
CREATE TABLE chat.message_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat.messages(id),

  name TEXT NOT NULL,
  type TEXT,
  size_bytes BIGINT,

  -- Storage
  persistent_url TEXT,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 User Memory

```sql
-- chat.user_memories
CREATE TABLE chat.user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,
  consumer_id UUID NOT NULL,

  category memory_category NOT NULL,
  content TEXT NOT NULL,
  confidence FLOAT DEFAULT 1.0,

  -- Source tracking
  source_session_id UUID REFERENCES chat.sessions(id),
  source_message_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memories_consumer ON chat.user_memories(application_id, consumer_id);
```

---

## Phase 3: RAG Schema

### 3.1 Knowledge Sources & Chunks

```sql
-- rag.knowledge_sources (was ApplicationAssistantFile)
CREATE TABLE rag.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,

  -- Identity
  name TEXT NOT NULL,
  display_name TEXT,
  type knowledge_source_type NOT NULL,

  -- Source details
  url TEXT,
  size_bytes BIGINT,

  -- Processing
  status knowledge_source_status DEFAULT 'PENDING',
  rag_mode rag_mode DEFAULT 'CHUNKS',

  -- Refresh
  last_refreshed_at TIMESTAMPTZ,
  refresh_interval_hours INT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- rag.chunks (was textchunk)
CREATE TABLE rag.chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES rag.knowledge_sources(id) ON DELETE CASCADE,

  -- Content
  text TEXT NOT NULL,

  -- Embedding
  embedding vector(3072),
  embedding_provider TEXT DEFAULT 'openai',
  embedding_model TEXT DEFAULT 'text-embedding-3-large',

  -- Position
  chunk_index INT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chunks_source ON rag.chunks(source_id);
CREATE INDEX idx_chunks_embedding ON rag.chunks USING ivfflat (embedding vector_cosine_ops);

-- rag.document_summaries (was document_embeddings)
CREATE TABLE rag.document_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES rag.knowledge_sources(id) ON DELETE CASCADE,

  summary TEXT,
  full_text TEXT,

  -- Embedding
  embedding vector(3072),
  embedding_provider TEXT DEFAULT 'openai',
  embedding_model TEXT DEFAULT 'text-embedding-3-large',

  -- Section info for large docs
  section_metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source_id)
);
```

---

## Phase 4: Billing Schema

### 4.1 Consolidated Billing

```sql
-- billing.subscriptions
CREATE TABLE billing.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id),

  -- Stripe
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,

  -- Status
  tier subscription_tier NOT NULL DEFAULT 'FREE',
  period subscription_period DEFAULT 'MONTHLY',
  status subscription_status DEFAULT 'ACTIVE',

  -- Trial
  trial_ends_at TIMESTAMPTZ,

  -- Dates
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- billing.credit_balance
CREATE TABLE billing.credit_balance (
  organization_id UUID PRIMARY KEY REFERENCES app.organizations(id),

  balance_cents INT DEFAULT 0,
  lifetime_usage_cents INT DEFAULT 0,

  -- Thresholds
  low_balance_threshold_cents INT DEFAULT 500, -- $5

  -- Status
  exhausted BOOLEAN DEFAULT FALSE,
  last_warning_at TIMESTAMPTZ,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- billing.usage_records
CREATE TABLE billing.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id),
  application_id UUID,

  -- Usage details
  model TEXT NOT NULL,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  total_tokens INT GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

  -- Cost
  cost_cents INT DEFAULT 0,

  -- Context
  session_id UUID,
  message_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_org_date ON billing.usage_records(organization_id, created_at);
CREATE INDEX idx_usage_app ON billing.usage_records(application_id) WHERE application_id IS NOT NULL;
```

---

## Phase 5: Integrations Schema

### 5.1 Unified Actions (Consolidate ActionCollection + ActionTemplate + UserDefinedTool)

```sql
-- app.action_collections
CREATE TABLE app.action_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES app.workspaces(id),

  -- Identity
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,

  -- Sharing
  sharing_scope sharing_scope DEFAULT 'PRIVATE',

  -- Metadata
  icon TEXT,
  cover_image TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Stats
  install_count INT DEFAULT 0,

  -- Review (for public collections)
  review_status review_status DEFAULT 'PENDING',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES app.users(id),

  created_by UUID NOT NULL REFERENCES app.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, slug)
);

-- app.actions (consolidates ActionTemplate)
CREATE TABLE app.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES app.action_collections(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  tool_name TEXT NOT NULL, -- AI function name
  description TEXT,
  tool_description TEXT, -- Description for AI

  -- Endpoint
  url TEXT NOT NULL,
  method http_method DEFAULT 'GET',

  -- Parameters (JSONB for flexibility)
  headers JSONB DEFAULT '{}',
  query_params JSONB DEFAULT '{}',
  body_params JSONB DEFAULT '{}',
  path_params JSONB DEFAULT '{}',

  -- Schema
  request_schema JSONB,
  response_schema JSONB,

  -- Auth
  auth_type action_auth_type DEFAULT 'NONE',
  auth_config JSONB,

  -- Options
  timeout_ms INT DEFAULT 30000,
  is_client_side BOOLEAN DEFAULT FALSE,

  -- Display
  present_tense_verb TEXT,
  past_tense_verb TEXT,
  ordinal INT DEFAULT 0,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- app.application_actions (links apps to actions, was UserDefinedTool)
CREATE TABLE app.application_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  action_id UUID REFERENCES app.actions(id), -- NULL if custom per-app

  -- Override settings (if action_id is set)
  -- Or full definition (if action_id is NULL - custom tool)
  name TEXT,
  tool_name TEXT,
  description TEXT,
  url TEXT,
  method http_method,
  headers JSONB,
  query_params JSONB,
  body_params JSONB,

  -- Variables specific to this app
  variables JSONB DEFAULT '{}',

  is_active BOOLEAN DEFAULT TRUE,
  ordinal INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(application_id, action_id)
);
```

### 5.2 External Integrations

```sql
-- app.integrations (was ApplicationIntegration)
CREATE TABLE app.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES app.applications(id),

  -- Type
  type integration_type NOT NULL, -- 'mcp', 'oauth', 'api_key', 'slack', 'whatsapp'
  name TEXT NOT NULL,

  -- Connection details (type-specific)
  config JSONB NOT NULL DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Enum Consolidation

### Keep (47 → ~25)

```sql
-- Core
CREATE TYPE subscription_tier AS ENUM ('FREE', 'PRO', 'TEAM', 'BUSINESS', 'ENTERPRISE');
CREATE TYPE subscription_period AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING');
CREATE TYPE environment_mode AS ENUM ('TEST', 'LIVE');

-- Publishing
CREATE TYPE publish_state AS ENUM ('ONLY_ME', 'WITH_LINK', 'ECOSYSTEM');
CREATE TYPE chat_type AS ENUM ('AssistantAPI', 'Prompt', 'ChippHosted');

-- RAG
CREATE TYPE knowledge_source_type AS ENUM (
  'FILE', 'URL', 'YOUTUBE', 'SPREADSHEET', 'API',
  'NOTION', 'GOOGLE_DRIVE', 'SHAREPOINT', 'AUDIO'
);
CREATE TYPE knowledge_source_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE rag_mode AS ENUM ('CHUNKS', 'SUMMARY', 'HYBRID');

-- Chat
CREATE TYPE chat_source AS ENUM ('APP', 'API', 'WHATSAPP', 'SLACK', 'EMAIL', 'VOICE');
CREATE TYPE sender_type AS ENUM ('USER', 'BOT', 'SYSTEM');
CREATE TYPE message_type AS ENUM ('TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO');
CREATE TYPE memory_category AS ENUM ('FACTS', 'PREFERENCES', 'INSIGHTS', 'QUERIES', 'OTHER');

-- Localization
CREATE TYPE language AS ENUM ('EN', 'ES', 'FR', 'DE', 'PT', 'ZH', 'JA', 'KO', 'AR', 'HI');
CREATE TYPE text_direction AS ENUM ('LTR', 'RTL');
CREATE TYPE currency AS ENUM ('USD', 'EUR', 'GBP', 'BRL', 'INR');

-- Actions
CREATE TYPE http_method AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
CREATE TYPE action_auth_type AS ENUM ('NONE', 'API_KEY', 'OAUTH2', 'BASIC', 'BEARER', 'CUSTOM');
CREATE TYPE sharing_scope AS ENUM ('PRIVATE', 'WORKSPACE', 'PUBLIC');
CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Voice
CREATE TYPE interaction_method AS ENUM ('CHAT', 'VOICE');
CREATE TYPE voice_flavor AS ENUM ('ALLOY', 'ASH', 'CORAL', 'ECHO', 'SAGE', 'SHIMMER');

-- Jobs
CREATE TYPE job_status AS ENUM ('PENDING', 'ACTIVE', 'COMPLETE', 'ERROR', 'CANCELLED');
```

### Remove

- `PackageType`, `PackageStatus` - Simplify to single Package model
- `WorkspaceTier` - Use org subscription_tier
- `WorkspaceVisibility` - Simplify to boolean is_private
- `DeveloperRole` - Rename to workspace_role
- `LeadGenerationTiming` - Only one value (START), remove
- Many `chipp_*` enums - Internal tool, can simplify

---

## Tech Debt Cleanup Summary

### Remove Legacy Fields

| Table          | Fields to Remove                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer/User | password, resetToken, resetTokenExpiry, magicLinkToken, magicLinkTokenExpiry, stripeSubscriptionId, stripeCustomerId, stripeAccountId, isUsageBasedSubscription |
| Consumer       | resetToken, resetTokenExpiry, magicLinkToken, magicLinkTokenExpiry, stripeCustomerId                                                                            |
| Application    | authDisabledForPlayground, monetizationEnabled, brandStyles, customDomain, customDomainSSLVerified                                                              |
| Collection     | brandStyles                                                                                                                                                     |

### Remove Duplicate Tables

| Keep                   | Remove                 |
| ---------------------- | ---------------------- |
| PostgreSQL textchunk   | MySQL FileTextchunk    |
| Main DB WhatsAppConfig | Chat DB WhatsAppConfig |

### Consolidate

| From                                                | To                                                             |
| --------------------------------------------------- | -------------------------------------------------------------- |
| ActionCollection + ActionTemplate + UserDefinedTool | app.action_collections + app.actions + app.application_actions |
| Developer + DeveloperCredentials                    | app.users + app.user_credentials                               |
| Multiple tier enums                                 | Single subscription_tier                                       |

### Standardize

| Issue                                   | Solution                       |
| --------------------------------------- | ------------------------------ |
| Mixed ID types (int/uuid/cuid)          | All UUIDs                      |
| Mixed soft delete (isDeleted/deletedAt) | All use deleted_at TIMESTAMPTZ |
| Mixed naming (camelCase/snake_case)     | All snake_case                 |

---

## Migration Strategy

### Phase 1: Read-Only Sync (Week 1-2)

1. Create new PostgreSQL database with schemas
2. Build ETL pipeline from MySQL → PostgreSQL
3. Run both in parallel, validate data consistency
4. New Deno app reads from PostgreSQL only

### Phase 2: Dual Write (Week 3-4)

1. Modify existing Node.js app to write to both DBs
2. Monitor for inconsistencies
3. Build rollback capability

### Phase 3: Cutover (Week 5)

1. Stop writes to MySQL
2. Final sync
3. Switch all reads to PostgreSQL
4. Retire MySQL connections

### Migration Scripts Needed

```
scripts/
├── migrate/
│   ├── 01-create-schemas.sql
│   ├── 02-create-enums.sql
│   ├── 03-create-tables.sql
│   ├── 04-create-indexes.sql
│   ├── 05-migrate-organizations.ts
│   ├── 06-migrate-users.ts
│   ├── 07-migrate-applications.ts
│   ├── 08-migrate-consumers.ts
│   ├── 09-migrate-chat-sessions.ts
│   ├── 10-migrate-messages.ts
│   ├── 11-migrate-embeddings.ts
│   └── 12-migrate-integrations.ts
└── validate/
    ├── compare-counts.ts
    └── spot-check-records.ts
```

---

## Production Data Analysis (December 2025)

### Developer Table (19,480 rows)

| Field                | Count | %    | Recommendation                                                         |
| -------------------- | ----- | ---- | ---------------------------------------------------------------------- |
| stripeCustomerId     | 631   | 3.2% | **Remove** - migrated to Org (99% on Org)                              |
| stripeSubscriptionId | 353   | 1.8% | **Remove** - migrated to Org                                           |
| stripeAccountId      | 712   | 3.7% | **Keep** - Stripe Connect for payouts, actively used (122 new in 2025) |
| password             | 5,903 | 30%  | **Keep** - local auth still used                                       |
| resetToken           | 74    | 0.4% | **Remove** - make stateless JWT                                        |
| magicLinkToken       | 322   | 1.7% | **Remove** - make stateless JWT                                        |

**DeveloperCredentials** (639 rows, 3.7% of devs):

- Mostly empty duplicate of Developer fields
- Unique useful fields: `isSuperAdmin`, `zapierAccessToken`, `otpCode/Expiry`
- **Recommendation**: Merge `isSuperAdmin` into User, move tokens to Redis/stateless

### Organization Table (19,485 active)

| Field                    | Count  | %      |
| ------------------------ | ------ | ------ |
| stripeCustomerId         | 19,484 | 99.99% |
| usageBasedBillingEnabled | 19,244 | 98.8%  |

**Billing has fully migrated to Organization level.** Developer Stripe fields are legacy.

### Consumer Table (78 million rows!)

| Field              | Count  | %       | Recommendation           |
| ------------------ | ------ | ------- | ------------------------ |
| password           | 22,064 | 0.03%   | **Keep** - but rare      |
| email              | 39,785 | 0.05%   | **Keep**                 |
| stripeCustomerId   | 2,083  | 0.003%  | **Remove** - barely used |
| subscriptionActive | 628    | 0.0008% | **Keep** - but rare      |
| credits            | 75.8M  | 97%     | **Keep** - core feature  |
| customInstructions | 19     | ~0%     | **Keep** - new feature   |

**Most consumers are anonymous** - just identifier + credits. Auth fields barely used.
Optimize for the 97% case: lightweight anonymous consumers.

### Revised User Schema (based on production data)

```sql
CREATE TABLE app.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture_url TEXT,
  username TEXT UNIQUE,

  -- Auth (30% use local auth)
  password_hash TEXT,
  email_verified BOOLEAN DEFAULT FALSE,

  -- Stripe Connect for payouts (actively used)
  stripe_account_id TEXT,
  stripe_onboarding_complete BOOLEAN DEFAULT FALSE,

  -- Profile
  acquisition_source TEXT,
  acquisition_referrer_url TEXT,
  has_completed_onboarding BOOLEAN DEFAULT FALSE,
  has_seen_builder_tour BOOLEAN DEFAULT FALSE,
  is_super_admin BOOLEAN DEFAULT FALSE,

  -- Context
  active_workspace_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ephemeral tokens in Redis, not DB:
-- - reset tokens (74 active)
-- - magic link tokens (322 active)
-- - OTP codes
```

### Revised Consumer Schema (optimized for 78M anonymous users)

```sql
CREATE TABLE app.consumers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,

  -- Identity
  identifier TEXT NOT NULL,
  mode environment_mode DEFAULT 'LIVE',

  -- Core (97% have credits)
  credits INT DEFAULT 0,

  -- Optional profile (0.05% have email)
  name TEXT,
  email TEXT,
  picture_url TEXT,

  -- Optional auth (0.03% use password)
  password_hash TEXT,
  email_verified BOOLEAN DEFAULT FALSE,

  -- Optional subscription (0.0008% active)
  subscription_active BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,

  -- User preferences
  custom_instructions TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(application_id, identifier, mode)
);

-- Remove from Consumer:
-- - resetToken, resetTokenExpiry (use stateless JWT)
-- - magicLinkToken, magicLinkTokenExpiry (use stateless JWT)
-- - collectionId (collections deprecated?)
```

### Application Table (99,248 active)

| Field                  | Usage      | Recommendation                          |
| ---------------------- | ---------- | --------------------------------------- |
| customCss              | 0          | **Remove** - nobody uses                |
| customComponents       | 3          | **Remove** - almost nobody              |
| phoneNumber            | 36         | **Keep** - voice is niche but growing   |
| publishState=ECOSYSTEM | 2,955 (3%) | Keep                                    |
| collectionId           | ~217 apps  | **Deprecate** - collections barely used |

### Collections (Old App Grouping - NOT ActionCollections)

| Table      | Count     | Notes                          |
| ---------- | --------- | ------------------------------ |
| Collection | 59 active | **Deprecated** - minimal usage |

### Chat Tables

| Table       | Count                |
| ----------- | -------------------- |
| ChatSession | 10.2M (98% from APP) |
| Message     | 11.2M                |

**Session Sources:**

- APP: 10M (98%)
- API: 198K (2%)
- WHATSAPP: 2,855 (0.03%)
- SLACK: 530 (0.005%)
- EMAIL: 72 (0.0007%)

### Knowledge Sources (RAG)

| Type        | Count | %      |
| ----------- | ----- | ------ |
| URL         | 5.8M  | 98%    |
| FILE        | 100K  | 1.7%   |
| YOUTUBE     | 9.8K  | 0.2%   |
| SPREADSHEET | 432   | 0.007% |
| API         | 80    | 0.001% |

**Text Chunks (embeddings):** 9.9M

### Custom Actions & Tools

| Table            | Count | Notes                                      |
| ---------------- | ----- | ------------------------------------------ |
| UserDefinedTool  | 1,309 | Per-app tools - **active, keep**           |
| ActionCollection | 10    | Shared collections - **very low adoption** |
| ActionTemplate   | 91    | Actions in collections                     |

**Recommendation:** Keep UserDefinedTool pattern. ActionCollection system has low adoption - evaluate if worth keeping.

### Integrations

| Integration              | Count      | Notes                    |
| ------------------------ | ---------- | ------------------------ |
| ApplicationIntegration   | 174 active | Keep                     |
| SlackInstallation        | 48         | Keep                     |
| WhatsAppConfig (main DB) | 0 active   | **Wrong DB!**            |
| WhatsAppConfig (chat DB) | 28 active  | **This is the real one** |

**WhatsApp Duplicate Resolution:** Use chat DB version. Main DB version is stale/unused.

### Other Features

| Feature            | Count        | Notes              |
| ------------------ | ------------ | ------------------ |
| LeadGenerationForm | 1,542 active | Popular feature    |
| MessageTag         | 218 enabled  | Moderate use       |
| TokenUsage         | 1.5M records | Active billing     |
| SemanticRoute      | 6 enabled    | Experimental/niche |

### Membership & Multi-tenancy

| Table              | Count    | Notes            |
| ------------------ | -------- | ---------------- |
| WorkspaceMember    | 23,673   | Active           |
| OrganizationMember | 19,794   | Active           |
| WhitelabelTenant   | 0 active | Not launched yet |

### Experimental/New Features

| Feature                | Count | Notes                  |
| ---------------------- | ----- | ---------------------- |
| VideoGenerationJob     | 263   | New feature, keep      |
| Eval                   | 0     | Not launched yet       |
| chipp_issue (internal) | 1,690 | Internal tool tracking |

### Table Size Summary

| Category      | Tables                   | Total Rows |
| ------------- | ------------------------ | ---------- |
| Users/Auth    | Developer, Consumer      | 78M+       |
| Organizations | Organization, Workspace  | 20K        |
| Applications  | Application              | 100K       |
| Chat          | ChatSession, Message     | 21M+       |
| RAG           | KnowledgeSources, Chunks | 16M        |
| Billing       | TokenUsage               | 1.5M       |

---

## Final Consolidation Recommendations

### REMOVE (unused/legacy)

| Item                                  | Reason                    |
| ------------------------------------- | ------------------------- |
| `Developer.stripeCustomerId`          | 99% migrated to Org       |
| `Developer.stripeSubscriptionId`      | 99% migrated to Org       |
| `Developer.resetToken/magicLinkToken` | Use stateless JWT         |
| `Developer.subscriptionTier/Period`   | Use Org                   |
| `Consumer.stripeCustomerId`           | 0.003% usage              |
| `Consumer.resetToken/magicLinkToken`  | Use stateless JWT         |
| `Application.customCss`               | 0 usage                   |
| `Application.customComponents`        | 3 usage                   |
| `Application.collectionId`            | Collections deprecated    |
| `DeveloperCredentials` table          | Merge into User           |
| `Collection` table                    | 59 active, deprecated     |
| `WhatsAppConfig` (main DB)            | 0 active, duplicate       |
| `FileTextchunk` (main DB)             | Duplicate of PG textchunk |

### CONSOLIDATE

| From                              | To                            |
| --------------------------------- | ----------------------------- |
| Developer + DeveloperCredentials  | `app.users`                   |
| Organization billing fields       | `billing.subscriptions`       |
| ActionCollection + ActionTemplate | Simplify or keep for future   |
| WhatsAppConfig (2 DBs)            | Single `app.integrations` row |

### KEEP AS-IS (actively used)

| Table                    | Rows | Notes               |
| ------------------------ | ---- | ------------------- |
| Organization             | 19K  | Core billing entity |
| Workspace                | -    | Project containers  |
| Application              | 99K  | Core product        |
| Consumer                 | 78M  | End users           |
| ChatSession              | 10M  | Chat history        |
| Message                  | 11M  | Chat messages       |
| ApplicationAssistantFile | 5.9M | Knowledge sources   |
| textchunk (PG)           | 9.9M | Embeddings          |
| UserDefinedTool          | 1.3K | Custom actions      |
| TokenUsage               | 1.5M | Billing records     |
| LeadGenerationForm       | 1.5K | Lead gen            |
| SlackInstallation        | 48   | Slack integration   |

### KEEP BUT RENAME

| Old Name                 | New Name        | Reason            |
| ------------------------ | --------------- | ----------------- |
| Developer                | User            | Clearer           |
| ApplicationAssistantFile | KnowledgeSource | Clearer           |
| textchunk                | rag.chunks      | Consistent naming |

### MOVE TO REDIS (ephemeral)

| Data              | Current Location             | TTL    |
| ----------------- | ---------------------------- | ------ |
| Reset tokens      | Developer.resetToken         | 1 hour |
| Magic link tokens | Developer.magicLinkToken     | 15 min |
| OTP codes         | DeveloperCredentials.otpCode | 5 min  |
| Session tokens    | -                            | 7 days |

### INTERNAL TOOLS (separate concern)

The `chipp_*` tables in PostgreSQL (1,690 issues) are an internal issue tracker.
**Recommendation:** Keep in embeddings DB or move to separate service. Don't migrate to unified schema.

---

## Next Steps

1. **Review this plan** - Get feedback on consolidation decisions
2. **Create SQL schema files** - Implement the DDL
3. **Generate Kysely types** - Use kysely-codegen or manual typing
4. **Build migration scripts** - Start with low-risk tables
5. **Test with staging data** - Validate before production

---

## Open Questions

1. **Keep chipp\_\* issue tracker?** - It's in embeddings DB but is operational. Move to separate service?

2. **Collections feature status?** - Collection model seems partially deprecated. Full removal or redesign?

3. **WhatsApp dual storage** - Which DB version is authoritative? Need to investigate usage.

4. **Semantic routing tables** - Keep all or simplify? SemanticRoute, SemanticRouteUtterance, etc.

5. **Report system** - CustomReportDefinition, ReportSchedule - keep or rebuild?
