# Feature Migration Report: Email Integration

## Executive Summary
- **What it does**: Enables AI chatbot agents to converse with users over email via Postmark. Users send emails to a configured address, the system processes them through the AI agent (including tool calls, RAG, custom actions), and sends formatted plain-text replies back.
- **Complexity**: Medium (ChippDeno already has a near-complete implementation)
- **Dependencies**: Chat service, agent framework (agentLoop), RAG/knowledge sources, custom actions, Postmark API, billing/credit system
- **Recommended approach**: Gap analysis and targeted fixes -- ChippDeno already has a better architecture (fire-and-forget vs Temporal workflows) and better UI (multi-step wizard vs tabbed dialog). Focus on closing the specific gaps identified below.

## Current State: ChippDeno Already Has Near-Complete Implementation

ChippDeno has a working email integration with:
- Database migration (023_add_email_integration.sql)
- Full email service (config CRUD, thread management, whitelist, Postmark API)
- Email chat service (AI processing, markdown stripping, reply sending)
- Webhook routes (per-app and global)
- Integration API routes (config, whitelist, status, toggle)
- Svelte UI (EmailSetupDialog.svelte -- multi-step wizard)

The ChippDeno implementation is architecturally superior in several ways:
1. **No Temporal dependency** -- uses fire-and-forget async functions instead of 4-step Temporal workflows
2. **Better UI** -- multi-step wizard (loading -> setup -> webhook -> whitelist -> connected) vs ChippMono's tabbed dialog
3. **Cleaner code** -- single-file service pattern vs scattered server actions + API routes + Temporal activities

## Data Model

### ChippMono Prisma Schema

**EmailDeploymentConfig** (`/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/prisma/schema.prisma`):
```prisma
model EmailDeploymentConfig {
  id                       String    @id @default(uuid())
  applicationId            String    @unique
  application              Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  postmarkServerToken      String?   // Encrypted - only for custom domain
  postmarkMessageStream    String    @default("inbound")
  webhookUsername           String    // Encrypted
  webhookPassword           String    // Encrypted
  useSharedInfrastructure  Boolean   @default(true)
  inboundEmailAddress      String
  fromEmailAddress         String
  fromEmailName            String
  enableWhitelist          Boolean   @default(true)
  isActive                 Boolean   @default(false)
  isDeleted                Boolean   @default(false)
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt
  emailThreads             EmailThread[]
}
```

**EmailThread**:
```prisma
model EmailThread {
  id                        String    @id @default(uuid())
  emailDeploymentConfigId   String
  emailDeploymentConfig     EmailDeploymentConfig @relation(fields: [emailDeploymentConfigId], references: [id], onDelete: Cascade)
  threadId                  String    // SHA-256 hash of root message ID, truncated to 16 chars
  subject                   String
  chatSessionId             String    @unique
  firstMessageId            String    // RFC 5322 Message-ID
  participants              Json      @default("[]") // Array of email addresses
  isActive                  Boolean   @default(true)
  messageCount              Int       @default(0)
  createdAt                 DateTime  @default(now())
  updatedAt                 DateTime  @updatedAt
  @@unique([emailDeploymentConfigId, threadId])
}
```

**ApplicationEmailWhitelist**:
```prisma
model ApplicationEmailWhitelist {
  id            String    @id @default(uuid())
  email         String
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  @@unique([applicationId, email])
}
```

### ChippDeno Database Schema

**`app.email_configs`** (`/Users/hunterhodnett/code/chipp-deno/db/migrations/023_add_email_integration.sql`):
```sql
CREATE TABLE IF NOT EXISTS app.email_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  postmark_server_token TEXT,
  postmark_message_stream VARCHAR(50) DEFAULT 'inbound',
  webhook_username TEXT NOT NULL,
  webhook_password TEXT NOT NULL,
  use_shared_infrastructure BOOLEAN DEFAULT TRUE,
  inbound_email_address VARCHAR(255) NOT NULL,
  from_email_address VARCHAR(255) NOT NULL,
  from_email_name VARCHAR(100) NOT NULL,
  enable_whitelist BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(application_id)
);
```

**`app.email_threads`**:
```sql
CREATE TABLE IF NOT EXISTS app.email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_config_id UUID NOT NULL REFERENCES app.email_configs(id) ON DELETE CASCADE,
  thread_id VARCHAR(32) NOT NULL,
  subject TEXT NOT NULL,
  chat_session_id UUID NOT NULL,
  first_message_id TEXT NOT NULL,
  participants JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email_config_id, thread_id)
);
```

### Schema Parity Assessment

The ChippDeno schema matches ChippMono closely. Key differences:
- ChippDeno does NOT have a separate `email_whitelist` table -- whitelist management is done via JSONB or a different mechanism in the service layer
- ChippMono encrypts `postmarkServerToken`, `webhookUsername`, `webhookPassword` at rest; ChippDeno stores them in plaintext

## Implementation Details

### ChippMono Files

#### Server Actions
| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/actions/emailActions.ts` | `saveEmailConfig()` and `toggleEmailWhitelist()` server actions |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/actions/getSharedEmailDomain.ts` | Returns `POSTMARK_SHARED_DOMAIN` env var |

Key logic in `emailActions.ts` (213 lines):
- Both actions check `FEATURE_FLAGS.EMAIL_DEPLOYMENT` feature flag
- Both check authorization via `authorizeApplicationAccess()`
- `saveEmailConfig()` checks for **duplicate inbound email addresses** across all apps
- Determines `useSharedInfrastructure` based on whether email domain matches `POSTMARK_SHARED_DOMAIN`
- Encrypts `postmarkServerToken`, `webhookUsername`, `webhookPassword` using `encrypt()`
- Generates webhook credentials on first creation: `crypto.randomBytes(16).toString("hex")`

#### API Routes
| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/applications/[appId]/email-config` | GET | Read config (decrypted) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/applications/[applicationId]/email-config/route.ts` |
| `/api/applications/[appId]/email-config` | PUT | Upsert config | Same file |
| `/api/applications/[appId]/email-config` | DELETE | Soft delete config | Same file |
| `/api/email/webhook` | POST | Global webhook (shared infra) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/email/webhook/route.ts` |
| `/api/email/webhook/[applicationId]` | POST | Per-app webhook (custom domain) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/email/webhook/[applicationId]/route.ts` |

#### Temporal Workflow (ChippMono only)
| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-temporal-worker/src/workflows/emailChat.ts` | 4-step workflow: validate -> process chat -> send reply -> update thread |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-temporal-worker/src/activities/emailChat.ts` | Activity implementations (561 lines) |

Workflow config:
- Retry: max 3 attempts, 1s initial interval, 30s max, backoff 2x
- Non-retryable errors: `ValidationError`, `UnauthorizedError`, `NotWhitelistedError`
- Activity timeout: 5 minutes startToCloseTimeout

#### React Components
| Component | Purpose | File |
|-----------|---------|------|
| `DeployEmailCard` | Card entry point on Share page | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeployEmailCard.tsx` |
| `EmailDeploySetupDialog` | Main config dialog (1007 lines) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/EmailDeploySetupDialog.tsx` |
| `SharePage` | Parent page with feature flag gate | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/SharePage.tsx` |

#### Shared Types
| File | Types |
|------|-------|
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/types/emailChat.ts` | `PostmarkInboundPayload`, `EmailChatWorkflowInput`, `EmailChatWorkflowOutput`, activity I/O types |

### ChippDeno Files (Already Implemented)

#### Services
| File | Purpose | Lines |
|------|---------|-------|
| `/Users/hunterhodnett/code/chipp-deno/src/services/email.service.ts` | Config CRUD, thread mgmt, whitelist, Postmark API, deduplication | 711 |
| `/Users/hunterhodnett/code/chipp-deno/src/services/email-chat.service.ts` | AI processing, body cleaning, system prompt, agent loop, reply sending | 417 |

#### API Routes (Hono)
| File | Endpoints |
|------|-----------|
| `/Users/hunterhodnett/code/chipp-deno/src/api/routes/integrations/email.ts` | GET /status, GET /config, POST /config, POST /toggle-whitelist, GET /whitelist, POST /whitelist/add, POST /whitelist/remove, DELETE /disconnect |
| `/Users/hunterhodnett/code/chipp-deno/src/api/routes/webhooks/email.ts` | GET/POST /:applicationId (per-app), GET/POST / (global) |

#### UI
| File | Purpose | Lines |
|------|---------|-------|
| `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/builder/EmailSetupDialog.svelte` | Multi-step setup wizard | 982 |

#### Database
| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-deno/db/migrations/023_add_email_integration.sql` | Creates email_configs and email_threads tables |

## Architecture Comparison

### Processing Pipeline

**ChippMono (Temporal Workflow)**:
```
Inbound email -> Webhook route -> Start Temporal Workflow
  -> Activity 1: validateEmailActivity (check config, whitelist, dedup via Redis)
  -> Activity 2: processEmailChatActivity (build messages, run ChatRequestHandler)
  -> Activity 3: sendEmailReplyActivity (format, send via Postmark)
  -> Activity 4: updateEmailThreadActivity (increment count, update timestamp)
```

**ChippDeno (Fire-and-Forget)**:
```
Inbound email -> Webhook route -> handleEmailMessage() (async, no await)
  -> Get config, extract thread info, find/create thread
  -> Clean email body, get history, build system prompt
  -> Create LLM adapter with billing, register tools
  -> Run agentLoop(), collect response
  -> Save messages, format for email, send via Postmark
```

### Deduplication

| Aspect | ChippMono | ChippDeno |
|--------|-----------|-----------|
| Storage | Redis with TTL | In-memory Set with setTimeout |
| TTL | 30 min (Temporal) / 5 min (inline) | 5 min |
| Scalability | Multi-instance safe | Single-instance only |
| Key format | `email:dedup:${messageId}` | Message-ID string in Set |

### Credential Security

| Aspect | ChippMono | ChippDeno |
|--------|-----------|-----------|
| Postmark token | Encrypted at rest (`encrypt()`) | Stored in plaintext |
| Webhook username | Encrypted at rest | Stored in plaintext |
| Webhook password | Encrypted at rest | Stored in plaintext |

### Feature Gating

| Aspect | ChippMono | ChippDeno |
|--------|-----------|-----------|
| Gate type | Feature flag (`EMAIL_DEPLOYMENT`) | None currently |
| Tier gating | None | None |
| UI visibility | Conditional render in SharePage.tsx | Always visible in deploy section |

## Identified Gaps

### Gap 1: Missing Email Whitelist Table (Priority: HIGH)

ChippMono has a dedicated `ApplicationEmailWhitelist` table:
```prisma
model ApplicationEmailWhitelist {
  id            String @id @default(uuid())
  email         String
  applicationId String
  @@unique([applicationId, email])
}
```

ChippDeno's migration (023) does NOT create this table. The `emailService` in ChippDeno has whitelist methods but they may be querying a non-existent table or using a different storage mechanism. Verify whether the whitelist CRUD in `email.service.ts` actually works against the database.

**Action**: Check if `email.service.ts` whitelist methods work. If not, add a migration for `app.email_whitelist` table.

### Gap 2: Credential Encryption (Priority: MEDIUM)

ChippMono encrypts sensitive fields (Postmark tokens, webhook credentials) at rest using `encrypt()`/`decrypt()` from a shared utility. ChippDeno stores these in plaintext.

**Action**: Implement encryption for `postmark_server_token`, `webhook_username`, `webhook_password` columns. Use Deno's `crypto.subtle` API or a library like `@noble/ciphers`.

### Gap 3: Duplicate Inbound Email Validation (Priority: HIGH)

ChippMono validates that no two applications use the same inbound email address in `emailActions.ts`:
```typescript
// Check for existing configs with the same inbound address
const existingConfig = await prisma.emailDeploymentConfig.findFirst({
  where: {
    inboundEmailAddress: data.inboundEmailAddress,
    isDeleted: false,
    NOT: { applicationId: appId },
  },
});
if (existingConfig) {
  throw new Error("This inbound email address is already in use");
}
```

**Action**: Verify ChippDeno's POST /config route checks for duplicate `inbound_email_address` values across applications.

### Gap 4: Deduplication Scalability (Priority: LOW)

ChippDeno uses an in-memory Set for deduplication, which does not work across multiple server instances. ChippMono uses Redis.

**Action**: For production with multiple instances, consider using the database or a shared cache for deduplication. For single-instance deployment, the current approach is fine.

### Gap 5: Consumer Upsert for Email Senders (Priority: MEDIUM)

ChippMono's Temporal activities upsert a `Consumer` record for each email sender:
```typescript
// In processEmailChatActivity
const consumer = await prisma.consumer.upsert({
  where: { email_applicationId: { email: senderEmail, applicationId } },
  create: { email: senderEmail, applicationId, source: "email" },
  update: {},
});
```

This links email conversations to trackable consumer identities. ChippDeno's `email-chat.service.ts` does NOT upsert consumers.

**Action**: Add consumer upsert in `handleEmailMessage()` before creating the chat session.

### Gap 6: Thread Update After Processing (Priority: LOW)

ChippMono has a dedicated `updateEmailThreadActivity` that increments `messageCount` and updates `updatedAt` after each successful exchange. ChippDeno does not appear to update these fields after processing.

**Action**: Add a thread update step after successful reply sending in `handleEmailMessage()`.

### Gap 7: Feature Flag Gating (Priority: LOW)

ChippMono gates email behind `FEATURE_FLAGS.EMAIL_DEPLOYMENT`. ChippDeno has no feature flag gating for email.

**Action**: If email should be restricted to certain users/tiers, add gating. Otherwise, this is a non-issue if email is generally available.

### Gap 8: Error Reply Avoidance (Priority: LOW -- Already Handled)

ChippDeno explicitly notes in `email-chat.service.ts`:
```typescript
// Note: Unlike WhatsApp, we don't send error messages back to the user
// to avoid potential email loops
```

This matches ChippMono's approach. No gap here -- just documenting that the behavior is intentional.

## Key Business Logic

### Email Body Cleaning

Both implementations strip quoted reply content. ChippDeno's approach (`email-chat.service.ts` lines 77-102):
```typescript
function cleanEmailBody(text: string): string {
  // Stops at: "On [date], [name] wrote:", "From:", "Sent:", "---", "___"
  // Skips lines starting with ">"
  // Falls back to StrippedTextReply from Postmark
}
```

ChippMono's per-app webhook has similar logic (lines 178-215 of the `[applicationId]/route.ts`).

### Email-Specific System Prompt

Both add formatting instructions to prevent markdown in email responses. ChippDeno's version (`email-chat.service.ts` lines 218-230):
```
Format your responses for email compatibility:
- DO NOT use markdown formatting like **bold**, *italic*, [links](url), or # headers
- For emphasis, use UPPERCASE or write 'Important:' before key points
- For links, write the full URL on its own line
- For lists, use simple dashes or numbers
- Keep formatting simple and readable in plain text email clients
```

### Markdown Stripping

ChippDeno's `formatForEmail()` function (`email-chat.service.ts` lines 108-130) removes:
- Bold/italic markers (`**`, `*`, `__`, `_`)
- Markdown links (converts `[text](url)` to `text (url)`)
- Code blocks (keeps content, removes backtick markers)
- Headers (converts to UPPERCASE)
- Excessive whitespace

### RFC 5322 Email Threading

Thread tracking uses standard email headers:
- `Message-ID`: Unique identifier for each email
- `In-Reply-To`: The Message-ID of the email being replied to
- `References`: Chain of all Message-IDs in the thread

Thread ID is generated as a SHA-256 hash of the root message ID, truncated to 16 characters. This ensures all replies in a thread map to the same chat session.

### Two Infrastructure Modes

1. **Shared Infrastructure** (`useSharedInfrastructure: true`):
   - Uses Chipp's Postmark account and domain (e.g., `@agents.chipp.ai`)
   - No Postmark token needed from the user
   - Global webhook endpoint handles routing by looking up the recipient email address
   - Env vars: `POSTMARK_SHARED_SERVER_TOKEN`, `POSTMARK_SHARED_DOMAIN`

2. **Custom Domain** (`useSharedInfrastructure: false`):
   - User provides their own Postmark Server API Token
   - Per-app webhook endpoint: `/api/webhooks/email/:applicationId`
   - User must configure their Postmark server to POST to this URL
   - Requires Basic Auth (auto-generated webhook credentials)

## UI/UX Patterns

### ChippMono: Tabbed Dialog (React)

File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/EmailDeploySetupDialog.tsx`

Three tabs:
1. **Configuration** -- Postmark token, email addresses, display name, active toggle
2. **Webhook** -- Generated webhook URL with copy button, Basic Auth credentials
3. **Whitelist** (hidden if `enableWhitelist` is false) -- Add/remove email addresses

States:
- Unconfigured (first visit)
- Configured + Active
- Configured + Inactive

### ChippDeno: Multi-Step Wizard (Svelte)

File: `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/builder/EmailSetupDialog.svelte`

Five steps:
1. **Loading** -- Fetching current config
2. **Setup** -- Configure email addresses, Postmark token, display name
3. **Webhook** -- Show webhook URL and credentials for Postmark setup
4. **Whitelist** -- Manage allowed sender emails
5. **Connected** -- Success state showing active config

The ChippDeno wizard is a better UX because it guides users through setup sequentially rather than presenting all options simultaneously.

## Configuration & Constants

### Environment Variables

| Variable | Purpose | Used By |
|----------|---------|---------|
| `POSTMARK_SHARED_SERVER_TOKEN` | Postmark API token for shared infrastructure | Global webhook handler, reply sending |
| `POSTMARK_SHARED_DOMAIN` | Domain for shared inbound addresses (e.g., `agents.chipp.ai`) | Config save logic, infrastructure mode detection |
| `POSTMARK_WEBHOOK_TOKEN` | Auth token for global webhook endpoint | Global webhook route |

### Feature Flags

| Flag | Constant | Purpose |
|------|----------|---------|
| `EMAIL_DEPLOYMENT` | `FEATURE_FLAGS.EMAIL_DEPLOYMENT` | Gates email UI visibility in ChippMono |

Source: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/constants.ts` (line 80)

## Webhook Authentication

### Global Webhook (Shared Infrastructure)

ChippMono's global webhook (`/api/email/webhook`) checks a token from the `Authorization` header:
```typescript
const authToken = request.headers.get("authorization")?.replace("Bearer ", "");
if (authToken !== process.env.POSTMARK_WEBHOOK_TOKEN) {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Per-App Webhook (Custom Domain)

Uses HTTP Basic Auth with auto-generated credentials:
```typescript
const authHeader = request.headers.get("authorization");
const decoded = Buffer.from(authHeader.replace("Basic ", ""), "base64").toString();
const [username, password] = decoded.split(":");
// Compare against stored (encrypted) webhook credentials
```

ChippDeno implements both patterns in `/Users/hunterhodnett/code/chipp-deno/src/api/routes/webhooks/email.ts`.

## Postmark Inbound Payload Schema

Both implementations handle the same Postmark inbound webhook payload:

```typescript
interface PostmarkInboundEmail {
  FromName: string;
  From: string;
  FromFull: { Email: string; Name: string };
  To: string;
  ToFull: Array<{ Email: string; Name: string }>;
  Cc?: string;
  CcFull?: Array<{ Email: string; Name: string }>;
  Subject: string;
  Date: string;
  MessageStream: string;
  TextBody: string;
  HtmlBody: string;
  StrippedTextReply?: string;  // Postmark's own quoted-reply stripping
  MessageID: string;
  Headers: Array<{ Name: string; Value: string }>;
  Attachments?: Array<{
    Name: string;
    Content: string;
    ContentType: string;
    ContentLength: number;
  }>;
}
```

## Migration Recommendations

### Files to Reference

1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/actions/emailActions.ts` -- For duplicate email validation and credential encryption logic
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-temporal-worker/src/activities/emailChat.ts` -- For consumer upsert pattern and whitelist validation
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/applications/[applicationId]/email-config/route.ts` -- For Zod validation schemas
4. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/types/emailChat.ts` -- For shared type definitions

### Key Architectural Differences

| Aspect | ChippMono | ChippDeno |
|--------|-----------|-----------|
| Framework | Next.js API routes + Server Actions | Hono routes |
| UI | React (tabbed dialog) | Svelte 5 (multi-step wizard) |
| ORM | Prisma | Kysely |
| Async processing | Temporal workflows (4 activities) | Fire-and-forget async |
| Deduplication | Redis | In-memory Set |
| Credentials | Encrypted at rest | Plaintext |

### Implementation Priority

1. **HIGH: Verify whitelist table exists** -- Check if email.service.ts whitelist operations work against the database. If `app.email_whitelist` table is missing, create a migration.
2. **HIGH: Duplicate inbound email validation** -- Ensure POST /config checks uniqueness across applications.
3. **MEDIUM: Consumer upsert** -- Add consumer record creation for email senders to enable identity tracking.
4. **MEDIUM: Credential encryption** -- Encrypt Postmark tokens and webhook credentials at rest.
5. **LOW: Thread message count update** -- Increment `message_count` after each successful exchange.
6. **LOW: Feature flag gating** -- Add if email should be restricted.
7. **LOW: Deduplication scalability** -- Only matters for multi-instance deployments.

## Related Features

- **WhatsApp Integration** -- Nearly identical architecture (webhook -> AI processing -> reply). See `docs/migrations/whatsapp-chippmono.md`.
- **Slack Integration** -- Similar pattern but with more complex message formatting. See `docs/migrations/slack-chippmono.md`.
- **Chat Service** -- Core dependency for session/message management. Used by `chatService.getAppConfig()`, `chatService.addMessage()`, `chatService.getSessionMessages()`.
- **Agent Framework** -- `agentLoop()`, tool registry, RAG tools, custom action tools all used in email processing.
- **Billing** -- Credit checks via `createAdapterWithBilling()`. ChippMono's inline handler uses `skipCreditCheck: true`; ChippDeno runs billing through the adapter.
