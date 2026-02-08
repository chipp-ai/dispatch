# Feature Migration Report: Slack Integration

## Executive Summary
- **What it does**: Allows Chipp AI chatbot builders to deploy their bots to Slack workspaces, where users can interact with the AI via @mentions and direct messages in threaded conversations.
- **Complexity**: High - involves OAuth flow, encrypted credential storage, webhook event handling, threaded conversation management, Slack API interactions, and multi-user chat sessions.
- **Dependencies**: Chat system, RAG/knowledge sources, custom actions, billing/credit system, encryption service, LLM adapter.
- **Recommended approach**: ChippDeno already has a near-complete implementation with better UX (multi-step wizard vs single dialog). Focus on closing specific gaps rather than reimplementing.

## Data Model

### Database Tables (ChippMono - MySQL/Prisma)

#### `SlackInstallation`
Stores the bot token and workspace info after OAuth authorization.
- Key columns: `id` (Int PK), `workspaceTeamId` (String), `slackAppId` (String), `slackClientId` (String?), `slackClientSecret` (String? Text, encrypted), `workspaceName` (String?), `botToken` (String Text, encrypted), `signingSecret` (String? Text, per-installation), `installedById` (Int? FK to Developer)
- Relationships: Has many `SlackChatMapping`, belongs to `Developer` (optional)
- Unique constraint: `(workspaceTeamId, slackAppId)`
- **Note**: `slackClientId` and `slackClientSecret` were added later to support per-installation credentials

#### `SlackChatMapping`
Maps a Slack installation to a specific Chipp application by chat name.
- Key columns: `id` (Int PK), `slackInstallationId` (Int FK), `chatName` (String), `applicationId` (Int FK)
- Relationships: Belongs to `SlackInstallation`, belongs to `Application`
- Unique constraint: `(slackInstallationId, chatName)`
- **Note**: `chatName` is derived from the application name via `getShortenedAppIdentifier()` and is used for `@mention chatName` invocation in channels

#### `SlackOAuthState`
Temporary state for OAuth CSRF protection (10-minute expiry).
- Key columns: `id` (Int PK), `state` (String, unique), `applicationId` (Int FK), `developerId` (Int FK), `expiresAt` (DateTime)
- Relationships: Belongs to `Application`, belongs to `Developer`
- Index on `expiresAt` for cleanup queries

#### `SlackThreadContext`
Maps Slack thread timestamps to chat context for conversation continuity.
- Key columns: `threadTs` (String PK), `channelId` (String?), `workspaceTeamId` (String), `slackAppId` (String), `chatName` (String)
- Indexes: `workspaceTeamId`, `slackAppId`, `channelId`
- **Note**: Uses `threadTs` as primary key since Slack thread timestamps are globally unique within a workspace

#### `SlackUser`
Cached Slack user profiles for display in chat history (24-hour TTL in code).
- Key columns: `id` (Int PK), `slackUserId` (String), `workspaceTeamId` (String), `email` (String?), `realName` (String?), `displayName` (String?), `avatar` (String?), `title` (String?), `timezone` (String?), `statusText` (String?)
- Unique constraint: `(slackUserId, workspaceTeamId)`

#### `SlackChatSessionUser`
Links Slack users to chat sessions for multi-user thread attribution.
- Key columns: `id` (Int PK), `chatSessionId` (String), `slackUserId` (Int FK)
- Unique constraint: `(chatSessionId, slackUserId)`

### Credential Storage Pattern

**ChippMono**: Stores Slack credentials in `applicationCredentials.tools` JSON field under a `"slack"` key:
```json
{
  "slack": {
    "slackClientId": "plain-text-client-id",
    "slackClientSecret": "encrypted-string",
    "slackSigningSecret": "encrypted-string"
  }
}
```
File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/credentials/route.ts`

**ChippDeno**: Stores in `applications.settings` JSON field under a `"slack"` key:
```json
{
  "slack": {
    "slackClientId": "plain-text-client-id",
    "slackClientSecret": "encrypted-string",
    "slackSigningSecret": "encrypted-string"
  }
}
```
File: `/Users/hunterhodnett/code/chipp-deno/src/api/routes/integrations/slack.ts`

### Schema File Locations
- **ChippMono Prisma schema**: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/prisma/schema.prisma` (lines 1859-1956)
- **ChippDeno migrations**: `/Users/hunterhodnett/code/chipp-deno/src/db/migrations/` (tables: `app.slack_installations`, `app.slack_chat_mappings`, `app.slack_oauth_states`, `app.slack_thread_contexts`, `app.slack_users`, `app.slack_chat_session_users`)

---

## Implementation Details

### API Routes (ChippMono)

| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/slack/config` | GET | Returns server URLs (redirectUri, eventsUrl, interactivityUrl) for manifest generation | `apps/chipp-admin/app/api/slack/config/route.ts` |
| `/api/slack/credentials` | POST | Save encrypted Slack credentials (clientId, clientSecret, signingSecret) | `apps/chipp-admin/app/api/slack/credentials/route.ts` |
| `/api/applications/[id]/slack-credentials` | POST | Alternative credential save endpoint (duplicate of above) | `apps/chipp-admin/app/api/applications/[applicationId]/slack-credentials/route.ts` |
| `/api/slack/oauth/start` | GET | Generate OAuth state, redirect to Slack authorization | `apps/chipp-admin/app/api/slack/oauth/start/route.ts` |
| `/api/slack/oauth/callback` | GET | Exchange code for token, create installation + mapping | `apps/chipp-admin/app/api/slack/oauth/callback/route.ts` |
| `/api/slack/events` | POST | Main webhook - handles Events API, URL verification | `apps/chipp-admin/app/api/slack/events/route.ts` |
| `/api/slack/interactions` | POST | Interactive components (admin ban/block actions) | `apps/chipp-admin/app/api/slack/interactions/route.ts` |
| `/api/slack/example-question` | POST | Generate example question via LLM for setup dialog | `apps/chipp-admin/app/api/slack/example-question/route.ts` |
| `/api/chat-history/slack-user-enrichment` | POST | Enrich chat messages with Slack user profile data | `apps/chipp-admin/app/api/chat-history/slack-user-enrichment/route.ts` |

### ChippDeno Equivalent Routes

| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/integrations/slack/credentials` | POST | Save encrypted Slack credentials | `src/api/routes/integrations/slack.ts` |
| `/api/integrations/slack/oauth/start` | GET | Generate OAuth state, redirect to Slack | `src/api/routes/integrations/slack.ts` |
| `/api/integrations/slack/oauth/callback` | GET | Exchange code, create installation | `src/api/routes/integrations/slack.ts` |
| `/api/integrations/slack/status` | GET | Check Slack connection status | `src/api/routes/integrations/slack.ts` |
| `/api/integrations/slack/disconnect` | DELETE | Remove Slack installation | `src/api/routes/integrations/slack.ts` |
| `/api/integrations/slack/oauth-url` | GET | Get OAuth URL for redirect | `src/api/routes/integrations/slack.ts` |
| `/api/webhooks/slack` | POST | Webhook handler for Slack events | `src/api/routes/webhooks/slack.ts` |

### React Components (ChippMono)

| Component | Purpose | File |
|-----------|---------|------|
| `SlackDeploySetupDialog` | Main setup dialog - credential form + connected state | `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/SlackDeploySetupDialog.tsx` |
| `DeploySlackCard` | Card wrapper with Slack logo | `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeploySlackCard.tsx` |
| `SlackManifestSection` | Generates/displays Slack app manifest JSON | `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/SlackManifestSection.tsx` |

### ChippDeno Svelte Components

| Component | Purpose | File |
|-----------|---------|------|
| `SlackSetupDialog` | Multi-step wizard (create-app -> credentials -> install -> connected) | `web/src/lib/design-system/components/builder/SlackSetupDialog.svelte` |

---

## OAuth Flow (ChippMono)

### Step 1: User Enters Credentials
1. User opens SlackDeploySetupDialog
2. User creates a Slack app using the generated manifest (SlackManifestSection)
3. User enters `clientId`, `clientSecret`, `signingSecret` from their Slack app
4. POST `/api/slack/credentials` encrypts and saves to `applicationCredentials.tools.slack`

### Step 2: OAuth Authorization
1. User clicks "Install to Workspace"
2. Frontend opens popup window to `/api/slack/oauth/start?applicationId=X`
3. Backend generates UUID state, stores in `SlackOAuthState` with 10-minute expiry
4. Backend redirects to Slack OAuth URL with scopes

### Step 3: Callback
1. Slack redirects to `/api/slack/oauth/callback?code=X&state=X`
2. Backend validates state from DB (checks expiry)
3. Decrypts `slackClientSecret` from application credentials
4. Exchanges code for bot token via Slack's `oauth.v2.access`
5. Encrypts bot token
6. Upserts `SlackInstallation` (keyed on `workspaceTeamId + slackAppId`)
7. Deletes old `SlackChatMapping` records for the installation
8. Creates new `SlackChatMapping` with `chatName` from `getShortenedAppIdentifier()`
9. Returns HTML that calls `window.opener.postMessage({ type: 'slack-oauth-success' })`
10. Parent window receives message, updates UI to connected state

### OAuth Scopes (ChippMono)
```
chat:write
chat:write.public
app_mentions:read
channels:history
groups:history
im:history
channels:join
files:write
files:read
reactions:write
```

### OAuth Scopes (ChippDeno - broader)
```
app_mentions:read
channels:history
channels:join
channels:read    # extra
chat:write
chat:write.public
files:read
files:write
groups:history
groups:read      # extra
im:history
im:read          # extra
im:write         # extra
mpim:history     # extra
mpim:read        # extra
reactions:write
users:read
users:read.email
```

### Manifest Bot Events (ChippMono)
```
app_mention
message.im
message.groups
message.channels
```

---

## Webhook Event Handler (ChippMono)

File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/events/route.ts` (~2000 lines)

### Architecture

```
POST /api/slack/events
  |
  ├── URL verification challenge (immediate return)
  |
  ├── Signature verification (per-installation signing secret)
  |
  ├── Immediate 200 OK response (fire-and-forget)
  |
  └── Async processing:
      ├── Event deduplication (in-memory Set, 5-min TTL)
      ├── Filter: app_mention OR message.im only
      ├── Skip bot messages and subtypes
      ├── Resolve installation by (workspaceTeamId, slackAppId)
      ├── Resolve application via chat mapping
      ├── Add emoji reaction (LLM-selected)
      ├── Thread context management
      ├── Chat session resolution/creation
      ├── Message history hydration
      ├── LLM processing with tools
      ├── Markdown-to-mrkdwn conversion
      └── Post response to Slack thread
```

### Key Behaviors

#### 1. Signature Verification
```typescript
// Per-installation signing secret lookup
async function getSigningSecretForInstallation(teamId: string, appId: string) {
  const installation = await prisma.slackInstallation.findUnique({
    where: { workspaceTeamId_slackAppId: { workspaceTeamId: teamId, slackAppId: appId } },
  });
  if (installation?.signingSecret) {
    return await decrypt(installation.signingSecret);
  }
  return process.env.SLACK_SIGNING_SECRET; // fallback to env var
}
```
- Verifies `x-slack-signature` header using HMAC-SHA256 with `v0:timestamp:body`
- Falls back to environment `SLACK_SIGNING_SECRET` if no per-installation secret

#### 2. Event Deduplication
```typescript
const processedEvents = new Set<string>();
// Dedup key: `${event_id}:${event.user}:${event.ts}`
// Entries expire after 5 minutes
```

#### 3. LLM-Based Emoji Reaction
- Uses GPT-4o-mini to pick a relevant emoji based on the user's message
- Applied immediately as a "thinking" indicator before processing
- Example prompt: "Pick a single emoji reaction for this Slack message..."
- Falls back to "thinking_face" on error

#### 4. Thread Context Management
- New top-level messages create a `SlackThreadContext` record
- Follow-up thread messages look up existing context
- Cross-channel validation: if thread context exists for a different channel, it's rejected (security)
- Thread context stores: `threadTs`, `channelId`, `workspaceTeamId`, `slackAppId`, `chatName`

#### 5. Chat Session Resolution
- External ID format: `SLACK-{teamId}-{channelId}-{threadTs}`
- Looks up existing session by external ID in chat-history DB
- Creates new session if none exists (source: `SLACK`)
- Links Slack users to sessions via `SlackChatSessionUser`

#### 6. Thread History Hydration
- For thread follow-ups: fetches thread replies from Slack API via `conversations.replies`
- For top-level messages: optionally fetches channel history for context
- LLM decides context strategy: `none`, `time_range`, `search`, or `both`
- Channel history respects configurable time ranges

#### 7. Slack-Specific Tools
The events handler registers additional Slack-specific tools for the LLM:
- `uploadFile` - Upload files to Slack channels
- `getChannelHistory` - Fetch recent channel messages
- `searchChannelHistory` - Search channel message history
These are NOT present in the standard chat tool set.

#### 8. File Attachment Processing
- Extracts file URLs from Slack message blocks and thread messages
- Passes file context to the LLM for processing

#### 9. Markdown to Slack mrkdwn Conversion
File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/utils/markdown-conversion.ts`
```typescript
function convertMarkdownToSlackMrkdwn(text: string): string {
  // Bold: **text** -> *text*
  // Links: [text](url) -> <url|text>
  // Headers: # Header -> *Header*
  // Code blocks: ```lang\ncode``` -> ```code```
}
```

### Interactive Components Handler
File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/interactions/route.ts`

This is an **admin-only** feature, NOT related to AI chat:
- Handles `block_actions` type only
- Actions: `ban_user`, `block_domain`
- Requires `SLACK_ADMIN_USER_IDS` env var for authorization
- Used for internal Slack notifications when content moderation is needed
- ChippDeno likely does NOT need this (it's an internal Chipp admin tool)

---

## UI/UX Patterns

### ChippMono: SlackDeploySetupDialog (React)

**Two states:**

1. **Not Connected (Credential Entry)**:
   - SlackManifestSection showing generated app manifest JSON (copy/download buttons)
   - Three input fields: Client ID, Client Secret, Signing Secret
   - "Save Credentials" button
   - After saving: "Install to Workspace" button (opens OAuth popup)

2. **Connected State**:
   - Green checkmark with workspace name
   - "Reinstall" button (re-triggers OAuth)
   - Example question section (LLM-generated based on app config)
   - "@botname in Slack" usage example
   - "Disconnect" option

**SlackManifestSection** generates a complete Slack app manifest:
```json
{
  "display_information": {
    "name": "App Name",
    "description": "Built with Chipp",
    "background_color": "#111111"
  },
  "features": {
    "bot_user": {
      "display_name": "App Name",
      "always_online": true
    }
  },
  "oauth_config": {
    "redirect_urls": ["https://app.chipp.ai/api/slack/oauth/callback"],
    "scopes": {
      "bot": ["chat:write", "chat:write.public", "app_mentions:read", ...]
    }
  },
  "settings": {
    "event_subscriptions": {
      "request_url": "https://app.chipp.ai/api/slack/events",
      "bot_events": ["app_mention", "message.im", "message.groups", "message.channels"]
    },
    "interactivity": {
      "is_enabled": true,
      "request_url": "https://app.chipp.ai/api/slack/interactivity"
    }
  }
}
```

### ChippDeno: SlackSetupDialog (Svelte 5)

**Multi-step wizard (better UX):**

1. **Loading** - Checks existing connection status
2. **Create App** - Instructions + manifest generation (copy button)
3. **Credentials** - Three input fields with validation
4. **Install** - OAuth authorization step
5. **Connected** - Success state with workspace info + disconnect option

File: `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/builder/SlackSetupDialog.svelte` (634 lines)

### Key UX Differences
| Aspect | ChippMono | ChippDeno |
|--------|-----------|-----------|
| Flow | Single dialog with conditional sections | Multi-step wizard |
| Manifest | Collapsible section within credential form | Dedicated step before credentials |
| Example question | LLM-generated via `/api/slack/example-question` | Not implemented |
| OAuth feedback | postMessage from popup window | Same pattern |
| Disconnect | Within connected state | Dedicated disconnect button |
| Error handling | Toast notifications | Inline error display |

---

## Service Layer

### ChippMono Service Functions
The Slack service logic is spread across route handlers in ChippMono (no dedicated service file). Key functions:

| Function | Location | Purpose |
|----------|----------|---------|
| `getSigningSecretForInstallation()` | events/route.ts | Fetch per-installation signing secret |
| `verifySlackSignature()` | events/route.ts | HMAC-SHA256 signature verification |
| `getSlackUserInfo()` | events/route.ts | Fetch and cache Slack user profile (24h TTL) |
| `pickEmojiReaction()` | events/route.ts | LLM-based emoji selection |
| `convertMarkdownToSlackMrkdwn()` | utils/markdown-conversion.ts | Format conversion |
| `getShortenedAppIdentifier()` | shared utils | Generate chat name from app name |

### ChippDeno Service Layer
File: `/Users/hunterhodnett/code/chipp-deno/src/services/slack.service.ts` (745 lines)

Well-structured service with clear method groupings:

```typescript
export const slackService = {
  // Installation CRUD
  getInstallation(teamId, appId),
  getInstallationById(id),
  createInstallation(data),
  updateInstallation(id, data),
  deleteInstallation(id),
  getInstallationsForApp(applicationId),

  // OAuth state
  createOAuthState(data),
  getOAuthState(state),
  deleteOAuthState(id),
  cleanupExpiredStates(),

  // Chat mappings
  getChatMappingsForInstallation(installationId),
  createChatMapping(data),
  deleteChatMappingsForInstallation(installationId),

  // Thread contexts
  getThreadContext(threadTs),
  saveThreadContext(data),

  // Slack user caching
  getOrFetchSlackUser(slackUserId, teamId, botToken),
  getSlackUser(slackUserId, teamId),
  saveSlackUser(data),

  // Slack API calls
  postMessage(token, channel, text, threadTs?),
  addReaction(token, channel, timestamp, name),
  exchangeCodeForToken(code, clientId, clientSecret, redirectUri),
  joinChannel(token, channel),
  getSlackUserInfo(token, userId),
};
```

File: `/Users/hunterhodnett/code/chipp-deno/src/services/slack-chat.service.ts` (356 lines)

```typescript
// Main handler
export async function handleSlackMessage(params: HandleSlackMessageParams): Promise<void>

// Utilities
function convertMarkdownToSlackMrkdwn(text: string): string
function extractMessageText(text: string | undefined): string
```

### Encryption
Both systems encrypt sensitive fields (`botToken`, `slackClientSecret`, `slackSigningSecret`):
- ChippMono: Custom encryption utility in shared packages
- ChippDeno: `encrypt()`/`decrypt()` from `src/services/crypto.service.ts`

---

## Configuration & Constants

### Environment Variables

| Variable | ChippMono | ChippDeno | Purpose |
|----------|-----------|-----------|---------|
| `SLACK_SIGNING_SECRET` | Yes | Yes | Fallback signing secret |
| `SLACK_BOT_TOKEN` | Yes (testing) | No | For local testing only |
| `SLACK_ADMIN_USER_IDS` | Yes | No | Admin action authorization |
| `NGROK_SUBDOMAIN` | Yes (testing) | No | Local tunnel for webhook testing |
| `ENCRYPTION_KEY` | Yes | Yes | For encrypting tokens |

### OAuth Configuration
- Redirect URI format (ChippMono): `https://app.chipp.ai/api/slack/oauth/callback`
- Redirect URI format (ChippDeno): `{API_BASE_URL}/api/integrations/slack/oauth/callback`

---

## Identified Gaps in ChippDeno

### Gap 1: LLM-Based Emoji Reactions (Medium Priority)
ChippMono uses GPT-4o-mini to pick a contextual emoji reaction before processing. ChippDeno uses a static "thinking_face" emoji.

**ChippMono implementation** (events/route.ts lines 134-221):
```typescript
async function pickEmojiReaction(messageText: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Pick a single emoji reaction..." },
      { role: "user", content: messageText }
    ],
    max_tokens: 10,
  });
  return extractEmoji(response.choices[0].message.content);
}
```

**Recommendation**: Nice-to-have feature. The static "thinking_face" is adequate. Could add later.

### Gap 2: Channel Context Decision via LLM (Medium Priority)
ChippMono uses an LLM to decide whether to fetch channel history for context on top-level messages. The LLM returns one of: `none`, `time_range`, `search`, `both`.

**ChippDeno**: Does not fetch channel context for top-level messages.

**Recommendation**: This is a significant context-enrichment feature. Would improve response quality in channels. Requires implementing `conversations.history` and `conversations.replies` Slack API calls.

### Gap 3: Slack-Specific Tools (Medium Priority)
ChippMono registers additional tools for the LLM agent:
- `uploadFile` - Upload files to Slack
- `getChannelHistory` - Fetch recent messages from a channel
- `searchChannelHistory` - Search message history

**ChippDeno**: Does not register Slack-specific tools.

**Recommendation**: These tools significantly enhance the bot's capability in Slack. Should be added as part of the agent tool registration in `slack-chat.service.ts`.

### Gap 4: File Attachment Processing (Medium Priority)
ChippMono extracts and processes file attachments from Slack messages and passes them to the LLM.

**ChippDeno**: Does not process file attachments.

### Gap 5: Example Question Generation (Low Priority)
ChippMono has a `/api/slack/example-question` endpoint that generates a realistic example question using GPT-4o, displayed in the setup dialog.

**ChippDeno**: Not implemented.

**Recommendation**: Low priority, minor UX enhancement.

### Gap 6: Slack Manifest Generation (Low Priority)
ChippMono's SlackManifestSection dynamically fetches server URLs from `/api/slack/config` and builds a complete manifest JSON.

**ChippDeno**: Has manifest generation in the Svelte dialog but may not dynamically fetch URLs from the API.

### Gap 7: Slack User Enrichment for Chat History (Low Priority)
ChippMono has a dedicated `/api/chat-history/slack-user-enrichment` endpoint that enriches chat history messages with Slack user profile data (name, avatar).

**ChippDeno**: Not implemented as a separate endpoint.

### Gap 8: Interactive Components (Admin Actions) (Not Needed)
ChippMono's `/api/slack/interactions` handles ban/block admin actions from internal Slack notifications. This is Chipp-internal tooling, NOT part of the AI chatbot feature.

**Recommendation**: Skip. This is an internal admin tool.

### Gap 9: Cross-Channel Thread Security (High Priority)
ChippMono validates that thread context matches the channel it's being accessed from to prevent cross-channel information leakage.

**ChippDeno**: Should verify this security check exists in the webhook handler.

### Gap 10: Multi-User Thread Attribution (Medium Priority)
ChippMono links multiple Slack users to a single chat session via `SlackChatSessionUser`, allowing the chat history UI to show which Slack user sent each message.

**ChippDeno**: Has the table but should verify the linking logic exists.

### Gap 11: DB Table Name Mismatch (Bug)
ChippDeno's `slack.service.ts` queries `app.slack_installations` but the migration may have created the table as `app.slack_integrations` (based on 001_initial_schema.sql).

**From MEMORY.md**: "DB table is `app.slack_integrations` (001_initial_schema.sql), NOT `app.slack_installations`. The slack.service.ts queries `app.slack_installations` which doesn't exist yet - needs migration or rename."

**Recommendation**: Critical bug to verify and fix. Either rename the table or update the service queries.

---

## Key Differences from WhatsApp Integration

| Aspect | Slack | WhatsApp |
|--------|-------|----------|
| **Auth model** | OAuth v2 (user creates Slack app, enters credentials, authorizes) | Manual token setup (user provides API token from Meta) |
| **Credential storage** | `applications.settings.slack` (JSON column) | Dedicated `app.whatsapp_configs` table |
| **Session model** | Thread-based (`threadTs` maps to chat session) | Phone number-based (sender phone maps to session) |
| **Conversation trigger** | @mention in channel OR DM | Any incoming message to WhatsApp number |
| **Multi-user** | Yes (multiple Slack users in one thread) | No (one phone number = one user) |
| **Channel context** | Bot can fetch channel history for context | No equivalent (no channel concept) |
| **Interactive components** | Buttons, menus (block_actions) | Template messages with buttons |
| **File handling** | Process attachments from message blocks | Media messages (image, audio, video, document) |
| **Markdown** | Custom mrkdwn format (bold = `*text*`) | Standard WhatsApp formatting |
| **Setup complexity** | Higher (create Slack app + manifest + OAuth) | Lower (enter API token + phone number) |
| **Session timeout** | Thread-based (no timeout) | 90-day session timeout (ChippMono) |
| **Response limits** | None (Slack supports long messages) | 4096 char limit per message |

---

## Migration Recommendations

### Files to Reference in ChippMono
1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/events/route.ts` - Main webhook handler with all event processing logic (~2000 lines)
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/oauth/callback/route.ts` - OAuth callback with token exchange and installation creation
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/credentials/route.ts` - Credential encryption and storage
4. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/utils/markdown-conversion.ts` - Markdown to Slack format conversion
5. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/SlackDeploySetupDialog.tsx` - React setup dialog
6. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/SlackManifestSection.tsx` - Manifest generation
7. `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/prisma/schema.prisma` (lines 1859-1956) - All 6 Slack database models

### Files to Reference in ChippDeno (Current Implementation)
1. `/Users/hunterhodnett/code/chipp-deno/src/services/slack.service.ts` - Service layer (745 lines)
2. `/Users/hunterhodnett/code/chipp-deno/src/services/slack-chat.service.ts` - Chat handler (356 lines)
3. `/Users/hunterhodnett/code/chipp-deno/src/api/routes/integrations/slack.ts` - OAuth + credentials routes (610 lines)
4. `/Users/hunterhodnett/code/chipp-deno/src/api/routes/webhooks/slack.ts` - Webhook handler (241 lines)
5. `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/builder/SlackSetupDialog.svelte` - Svelte setup wizard (634 lines)

### Key Architecture Differences
- **ChippMono**: Next.js API routes with Prisma ORM (MySQL), React components
- **ChippDeno**: Hono API routes with Kysely ORM (PostgreSQL), Svelte 5 components
- **ChippMono**: No dedicated service layer (logic in route handlers)
- **ChippDeno**: Clean service layer separation (`slackService`, `handleSlackMessage`)
- **ChippMono**: Uses Slack Bolt-style patterns (WebClient caching)
- **ChippDeno**: Direct Slack API calls via fetch

### Implementation Priority Order
1. **Fix DB table name mismatch** (`slack_integrations` vs `slack_installations`) - Critical bug
2. **Cross-channel thread security** - Security concern
3. **Channel context enrichment** - Major feature gap (LLM context decision + channel history)
4. **Slack-specific tools** (uploadFile, getChannelHistory, searchChannelHistory)
5. **File attachment processing** - Handle file messages
6. **Multi-user thread attribution** - Verify SlackChatSessionUser linking works
7. **LLM emoji reactions** - Nice-to-have
8. **Example question generation** - Minor UX
9. **Slack user enrichment endpoint** - For chat history display

---

## Related Features
- **Chat System** - Slack messages create chat sessions and use the standard agent loop
- **RAG/Knowledge Sources** - Slack bot registers RAG tools if app has knowledge sources
- **Custom Actions** - Slack bot registers custom action tools for the LLM
- **Billing/Credits** - Slack messages consume credits via `createAdapterWithBilling()`
- **WhatsApp Integration** - Similar pattern but with key architectural differences (see comparison table)
- **Encryption Service** - Used for storing bot tokens and signing secrets securely
