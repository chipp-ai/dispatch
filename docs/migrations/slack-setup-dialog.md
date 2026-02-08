# Feature Migration Report: Slack Setup/Configuration Dialog

## Executive Summary
- **What it does**: Multi-step dialog that guides users through creating a Slack app, entering OAuth credentials, installing the bot to a workspace, and managing the connected state. Appears in both the App Builder Share tab (Deploy section) and the Onboarding flow.
- **Complexity**: Medium
- **Dependencies**: Slack API routes (config, credentials, OAuth start/callback, example-question), Prisma SlackInstallation/SlackChatMapping/SlackOAuthState models, ServiceUrls utility, encryption for secrets
- **Recommended approach**: ChippDeno already has a Svelte implementation (`SlackSetupDialog.svelte`) with a proper multi-step wizard. However, it is **missing several key features** from ChippMono: the JSON manifest generation/download, the AI-generated example question, the "copy mention example" feature, and the OAuth popup success/error HTML pages. These gaps should be addressed.

---

## ChippMono Implementation: Two Identical Dialogs

ChippMono has **two nearly identical** Slack setup dialog components:

1. **Builder Share Tab**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/SlackDeploySetupDialog.tsx`
2. **Onboarding Flow**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/components/SlackSetupDialog.tsx`

Both are essentially the same dialog with slight differences in how they fetch application data (the builder version uses `useApplicationDetail()` context, the onboarding version uses a `getApplicationForSlackSetup()` server action).

---

## Dialog States & Full UI Copy

### State 1: NOT CONFIGURED (No credentials saved)

**Dialog Header:**
- Title: "Slack Configuration"
- Description: "Connect your assistant to Slack workspaces by creating your own Slack app"

**Blue Setup Instructions Box** (`bg-blue-50 border border-blue-200`):
```
Setup Instructions:

1. Go to api.slack.com/apps [ExternalLink icon]
2. Click "Create New App" -> From manifest
3. Paste the JSON manifest below and click Create
4. After the app is created copy its Client ID, Client Secret
   and Signing Secret into the fields below
```

**Manifest Section** (rendered by `SlackManifestSection` component):
- Header: "Slack App Manifest (JSON)" with two buttons:
  - [Copy icon] "Copy" button - copies manifest to clipboard
  - "Download" button - downloads as `{assistant-name}-slack-manifest.json`
- Shows full JSON manifest in a `<pre>` block (see Manifest section below)

**Separator line**

**Credential Input Fields** (3 fields):

1. **Client ID**
   - Label: "Client ID"
   - Input: text, placeholder `1234567890.1234567890123`
   - Helper text: "Found in App Settings -> Basic Information -> App Credentials"
   - CSS: `border-2 rounded-xl focus-visible:ring-2 h-10 bg-background`

2. **Client Secret**
   - Label: "Client Secret"
   - Input: `type="password"`, placeholder `abcdef1234567890abcdef1234567890`
   - Helper text: "Found in App Settings -> Basic Information -> App Credentials"

3. **Signing Secret**
   - Label: "Signing Secret"
   - Input: `type="password"`, placeholder `abcdef1234567890abcdef1234567890abcdef12`
   - Helper text: "Found in App Settings -> Basic Information -> App Credentials"

**Footer** (sticky bottom bar with border-top):
- "Save Configuration" button (disabled when saving or any field empty)
- Shows "Saving..." while in progress
- If credentials already exist AND editing: also shows "Cancel" button

### State 2: CONFIGURED (Credentials saved, ready to install)

**Green success box** (`bg-green-50 border border-green-200`):
```
[checkmark] Slack app credentials configured. Your assistant is ready to be installed in Slack.
```

**Install button** (centered):
- "Install to Slack" - opens OAuth flow in a 600x700 popup window

**Separator line**

**Mention Example Section:**
```
After installation, mention @{appName} in any channel:
```
- Shows a copyable code block (`bg-muted rounded-lg`) containing:
  ```
  @{appName} {AI-generated example question OR "How can you help me?"}
  ```
- Clicking the block copies to clipboard with toast: "Copied: @AppName How can you help me?"
- Copy icon shown on the right side

**Edit Credentials button** (outline variant, centered below):
- "Edit Credentials" - switches back to editing state

### State 3: LOADING (Onboarding variant only)

The onboarding variant shows a spinner (`Loader2`) centered while fetching application data.

### State 4: ERROR (Onboarding variant only)

If application data fails to load: "Failed to load application data" centered text.

---

## Generated Slack App Manifest

The `SlackManifestSection` component fetches configuration from `/api/slack/config` and generates this manifest:

```json
{
  "_metadata": {
    "major_version": 2,
    "minor_version": 1
  },
  "display_information": {
    "name": "{assistantName}",
    "description": "AI assistant powered by Chipp",
    "background_color": "{primaryColor || '#4F46E5'}"
  },
  "features": {
    "app_home": {
      "messages_tab_enabled": true,
      "messages_tab_read_only_enabled": false
    },
    "bot_user": {
      "display_name": "{assistantName}",
      "always_online": true
    }
  },
  "oauth_config": {
    "redirect_urls": ["{baseUrl}/api/slack/oauth/callback"],
    "scopes": {
      "bot": [
        "chat:write",
        "chat:write.public",
        "app_mentions:read",
        "channels:history",
        "groups:history",
        "im:history",
        "files:write",
        "files:read",
        "channels:join",
        "reactions:write",
        "users:read",
        "users:read.email"
      ]
    }
  },
  "settings": {
    "interactivity": {
      "is_enabled": true,
      "request_url": "{baseUrl}/api/slack/interactivity"
    },
    "event_subscriptions": {
      "request_url": "{baseUrl}/api/slack/events",
      "bot_events": [
        "app_mention",
        "message.im",
        "message.groups",
        "message.channels"
      ]
    },
    "socket_mode_enabled": false
  }
}
```

### Config Endpoint

`GET /api/slack/config` returns:
```json
{
  "redirectUri": "{baseUrl}/api/slack/oauth/callback",
  "appHost": "{baseUrl}",
  "eventsUrl": "{baseUrl}/api/slack/events",
  "interactivityUrl": "{baseUrl}/api/slack/interactivity"
}
```

Source: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/config/route.ts`

The `ServiceUrls` utility provides these URLs:
```typescript
static slack = {
  oauth: {
    callback: () => `${ServiceUrls.baseUrl}/api/slack/oauth/callback`,
    start: (applicationId: string) =>
      `${ServiceUrls.baseUrl}/api/slack/oauth/start?applicationId=${encodeURIComponent(applicationId)}`,
  },
  events: () => `${ServiceUrls.baseUrl}/api/slack/events`,
  interactivity: () => `${ServiceUrls.baseUrl}/api/slack/interactivity`,
};
```

Source: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/serviceUrls.ts` (lines 20-27)

---

## AI-Generated Example Question

When the dialog is in "configured" state, it fetches an AI-generated example question tailored to the assistant's purpose.

**API Endpoint**: `POST /api/slack/example-question`

**Request body**:
```json
{
  "name": "AssistantName",
  "description": "Optional description",
  "systemPrompt": "Optional system prompt"
}
```

**Implementation** (`/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/example-question/route.ts`):
- Uses OpenAI GPT-4o with `temperature: 0.7`, `max_tokens: 25`
- System prompt: "You are brainstorming user questions for an AI assistant."
- User prompt: Combines assistant name, description, system prompt with instruction to give ONE realistic question
- Post-processing: strips quotes/bullets/dashes, truncates to 120 chars, fallback "How can you help me?"
- Result is cached in `sessionStorage` using a fingerprint hash of name+description+systemPrompt

The example is displayed in the mention example section:
```
@AssistantName What's the latest sales report?
```

---

## OAuth Flow

### Starting OAuth (`GET /api/slack/oauth/start?applicationId=X`)

Source: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/oauth/start/route.ts`

1. Authenticates user, looks up developer + application
2. Reads `slackClientId` and `slackClientSecret` from `applicationCredentials.tools.slack`
3. Generates UUID state, stores in `SlackOAuthState` table (expires in 10 minutes)
4. Redirects to `https://slack.com/oauth/v2/authorize` with:
   - `client_id`: from app's saved credentials
   - `scope`: `chat:write,chat:write.public,app_mentions:read,channels:history,groups:history,im:history,channels:join,files:write,files:read,reactions:write`
   - `redirect_uri`: `{baseUrl}/api/slack/oauth/callback`
   - `state`: generated UUID

**Note**: The manifest includes `users:read` and `users:read.email` scopes, but the OAuth start route does NOT include them. This is a discrepancy in ChippMono.

### OAuth Callback (`GET /api/slack/oauth/callback`)

Source: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/oauth/callback/route.ts`

1. Validates `state` parameter against `SlackOAuthState` table
2. Checks state hasn't expired (10 minute window)
3. Decrypts stored Slack credentials from the application
4. Exchanges code for bot token via `https://slack.com/api/oauth.v2.access`
5. Encrypts the bot token
6. Upserts `SlackInstallation` record (unique on `workspaceTeamId + slackAppId`)
7. Cleans up old `SlackChatMapping` records for this installation
8. Creates new `SlackChatMapping` linking the installation to the application
9. Deletes the `SlackOAuthState` record
10. Returns HTML page that:
    - Shows success with green checkmark icon
    - Posts `{ type: 'slack-oauth-success', applicationId }` message to parent window
    - Auto-closes after 1.5 seconds

**Error HTML page**: Red X icon, "Installation Failed", error message, posts `slack-oauth-error` to parent, closes after 3 seconds.

### OAuth Popup Handling (Client-Side)

Both dialog components open the OAuth URL in a 600x700 centered popup window:
```typescript
const windowFeatures = [
  `width=${width}`, `height=${height}`, `left=${left}`, `top=${top}`,
  "toolbar=no", "location=no", "directories=no", "status=no",
  "menubar=no", "scrollbars=yes", "resizable=yes", "copyhistory=no", "popup=yes"
].join(",");
```

Client listens for `MessageEvent`:
- `slack-oauth-success`: Shows success toast, focuses main window
- `slack-oauth-error`: Shows error toast, focuses main window
- Polls `popup.closed` every 1 second to clean up listener
- Fallback: If popup blocked, opens in new tab with toast error

---

## Credentials Save API

**Endpoint**: `POST /api/slack/credentials`

Source: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/credentials/route.ts`

**Request body**:
```json
{
  "applicationId": 123,
  "slackClientId": "1234567890.1234567890123",
  "slackClientSecret": "abcdef...",
  "slackSigningSecret": "abcdef..."
}
```

**Behavior**:
1. Validates all fields present
2. Authenticates user session
3. Looks up developer, verifies application belongs to developer's workspace
4. Encrypts `slackClientSecret` and `slackSigningSecret` using `encrypt()` from `shared-utils-server`
5. Updates `applicationCredentials.tools` JSON field with:
```json
{
  "slack": {
    "slackClientId": "plaintext",
    "slackClientSecret": "encrypted",
    "slackSigningSecret": "encrypted"
  }
}
```
6. Returns `{ ok: true }`

---

## Data Model

### Database Tables (ChippMono Prisma)

**SlackInstallation** - Stores Slack workspace installations
- `id`: Int (auto-increment)
- `workspaceTeamId`: String - Slack team/workspace ID
- `slackAppId`: String - Slack app identifier
- `slackClientId`: String? - Client ID for this app
- `slackClientSecret`: String? (Text) - Encrypted client secret
- `workspaceName`: String? - Display name of workspace
- `botToken`: String (Text) - Encrypted bot OAuth token
- `signingSecret`: String? (Text) - Encrypted signing secret
- `installedById`: Int? -> Developer - Who installed it
- Unique: `[workspaceTeamId, slackAppId]`
- Has many: `SlackChatMapping[]`

**SlackChatMapping** - Maps installations to Chipp applications
- `id`: Int (auto-increment)
- `slackInstallationId`: Int -> SlackInstallation
- `chatName`: String - Shortened app identifier (e.g., "salesassistant-42")
- `applicationId`: Int -> Application
- Unique: `[slackInstallationId, chatName]`

**SlackOAuthState** - Temporary OAuth state storage
- `id`: Int (auto-increment)
- `state`: String (unique) - UUID for CSRF protection
- `applicationId`: Int -> Application
- `developerId`: Int -> Developer
- `expiresAt`: DateTime - 10-minute expiration
- Index on `expiresAt`

**SlackThreadContext** - Thread-to-application routing
- `threadTs`: String (primary key) - Slack thread timestamp
- `channelId`: String? - Channel where thread exists
- `workspaceTeamId`: String
- `slackAppId`: String
- `chatName`: String

**SlackUser** - Cached Slack user profiles
- `id`: Int (auto-increment)
- `slackUserId`: String
- `workspaceTeamId`: String
- `email`, `realName`, `displayName`, `avatar`, `title`, `timezone`, `statusText`: optional profile fields
- Unique: `[slackUserId, workspaceTeamId]`

**SlackChatSessionUser** - Maps chat sessions to Slack users
- `id`: Int (auto-increment)
- `chatSessionId`: String - References chat history DB
- `slackUserId`: Int -> SlackUser
- Unique: `[chatSessionId, slackUserId]`

Schema source: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (lines 1859-1956)

### Credential Storage

Slack credentials are stored in the `applicationCredentials.tools` JSON column as:
```json
{
  "slack": {
    "slackClientId": "1234567890.1234567890123",
    "slackClientSecret": "encrypted:...",
    "slackSigningSecret": "encrypted:..."
  }
}
```

The `encrypt()` and `decrypt()` functions from `shared-utils-server/src/encrypt` handle credential security.

---

## Deployment Card (Entry Point)

The Slack setup dialog is launched from a "Deploy to Slack" card in the Share page.

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeploySlackCard.tsx`

```
[Slack Logo Image - 35x35px]  Deploy to Slack
                               Connect your assistant to Slack workspaces. Team members can
                               interact with your AI by mentioning it in channels or direct
                               messages.

                               [{hasCredentials ? "Manage Deployment" : "Add Deployment"}]
```

The Share page (`SharePage.tsx`) organizes content into two tabs:
- **Share tab**: Link, Iframe, Widget, API Access, Marketplace
- **Deploy tab**: Slack, WhatsApp, Email, PWA, Smartsheet (feature-flagged)

DeploySlackCard always appears in the Deploy tab (no feature flag gating).

---

## Onboarding Integration

In the onboarding flow's Share step, Slack appears as a "Deploy to platforms" option:

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/components/ShareStep.tsx`

```
Deploy to platforms

[Hash icon]  Slack
             Deploy your assistant to Slack workspaces
             [Set up >]

[Phone icon] WhatsApp
             Connect your assistant to WhatsApp
             [Set up >]
```

Clicking "Set up" on Slack opens the `SlackSetupDialog` from the onboarding components directory. This version is functionally identical to the builder version but:
- Takes `applicationId` as a prop instead of using context
- Fetches app data via `getApplicationForSlackSetup()` server action (defined in `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/actions.ts`)
- The server action returns: `{ id, name, description, systemPrompt, primaryColor, slackCredentials }`

---

## ChippDeno Existing Implementation

ChippDeno already has a Slack setup dialog at:
`/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/builder/SlackSetupDialog.svelte`

### Current Steps in ChippDeno:

**Step 1: Create a Slack App**
- "Step 1" badge
- "Create a Slack App"
- "First, you need to create a Slack app in your workspace. Click the button below to open the Slack API dashboard."
- Info box: "When creating your app:" -> "Choose 'From scratch'", "Give it a name", "Select the workspace"
- Button: "Create Slack App" [ExternalLink icon]
- Footer: "Cancel" | "I've created my app"

**Step 2: Enter Credentials**
- "Step 2" badge
- "Enter Credentials"
- "Copy these values from your Slack app's settings page."
- Same 3 fields (Client ID, Client Secret, Signing Secret) with same helper text
- Yellow warning info box with manual configuration instructions:
  - "Go to OAuth & Permissions, add redirect URL: `{apiBaseUrl}/api/integrations/slack/oauth/callback`"
  - "Add Bot Token Scopes: `chat:write`, `channels:history`, `app_mentions:read`, `im:history`"
  - "Go to Event Subscriptions, enable events, set Request URL: `{apiBaseUrl}/api/webhooks/slack`"
  - "Subscribe to bot events: `app_mention`, `message.im`"
- Footer: "Back" | "Save & Continue"

**Step 3: Install to Slack**
- "Step 3" badge
- "Install to Slack"
- "Click the button below to install your app to a Slack workspace. A popup will open for you to authorize the connection."
- Install button with Slack SVG icon
- Footer: "Back"

**Connected State:**
- Green status banner with check icon, workspace name
- Info box: "Your bot is ready!" with usage tips
- "Disconnect" button (with confirmation dialog)
- Footer: "Done"

---

## Gap Analysis: ChippMono vs ChippDeno

### Features ChippMono has that ChippDeno is MISSING:

| Feature | ChippMono | ChippDeno | Priority |
|---------|-----------|-----------|----------|
| **JSON Manifest generation** | Full manifest with Copy/Download buttons | Manual instructions in yellow warning box | **HIGH** |
| **AI-generated example question** | GPT-4o generates contextual question | Not present | Low |
| **Copy mention example** | `@BotName {question}` with copy-to-clipboard | Basic usage tips in info box | Medium |
| **Dynamic URLs in manifest** | Fetched from `/api/slack/config` | Hardcoded `getApiBaseUrl()` | Medium |
| **Bot scopes in manifest** | 12 scopes including `files:write/read`, `users:read/email` | Only 4 scopes listed manually | **HIGH** |
| **Bot events in manifest** | 4 events: `app_mention`, `message.im`, `message.groups`, `message.channels` | Only 2 events listed: `app_mention`, `message.im` | **HIGH** |
| **"From manifest" flow** | User creates app FROM manifest (auto-configures everything) | User creates app "From scratch" (must manually configure) | **HIGH** |
| **Manifest download** | Downloads as `{name}-slack-manifest.json` | Not available | Medium |
| **OAuth success/error HTML pages** | Full styled HTML pages with auto-close and parent messaging | Expects `slack-oauth-complete` message (may not have server-side HTML pages) | Medium |
| **Credential encryption** | `encrypt()` before storing | Unclear from UI code alone | High |
| **primaryColor in manifest** | Uses app's brand color for Slack app background | Not present | Low |
| **Disconnect feature** | Not in ChippMono dialogs (only connect/edit) | Has disconnect with confirmation | ChippDeno is better here |

### Features ChippDeno has that ChippMono is MISSING:

| Feature | Details |
|---------|---------|
| **Disconnect button** | Proper disconnect with confirmation dialog |
| **Multi-step wizard** | Clear step numbers (1, 2, 3) with navigation |
| **Connection status check** | Calls `/api/integrations/slack/status` on open |
| **Better step design** | Step badges, clear progression |

---

## Hardcoded Colors Requiring CSS Variable Mapping

### ChippMono hardcoded colors in dialog:

| Element | ChippMono Color | ChippDeno CSS Variable |
|---------|----------------|----------------------|
| Setup instructions box | `bg-blue-50 border-blue-200` | `hsl(var(--info) / 0.1)` or `hsl(var(--muted))` |
| Setup instructions heading | `text-blue-900` | `hsl(var(--foreground))` |
| Setup instructions text | `text-blue-800` | `hsl(var(--muted-foreground))` |
| Success box | `bg-green-50 border-green-200` | `hsl(142 70% 45% / 0.1)` (ChippDeno uses this) |
| Success text | `text-green-800` | `hsl(142 70% 35%)` or `hsl(var(--foreground))` |
| Helper text | `text-muted-foreground` | `hsl(var(--muted-foreground))` (already compatible) |
| Manifest pre block | `bg-muted` | `hsl(var(--muted))` |

ChippDeno's existing implementation already uses CSS variables correctly. The main work is adding the manifest generation feature.

---

## API Routes Summary

| Endpoint | Method | Purpose | ChippMono File | ChippDeno Equivalent |
|----------|--------|---------|----------------|---------------------|
| `/api/slack/config` | GET | Returns URLs for manifest | `apps/chipp-admin/app/api/slack/config/route.ts` | Needs creation |
| `/api/slack/credentials` | POST | Save encrypted credentials | `apps/chipp-admin/app/api/slack/credentials/route.ts` | `/api/integrations/slack/credentials` |
| `/api/slack/oauth/start` | GET | Initiate OAuth flow | `apps/chipp-admin/app/api/slack/oauth/start/route.ts` | `/api/integrations/slack/oauth-url` |
| `/api/slack/oauth/callback` | GET | Complete OAuth flow | `apps/chipp-admin/app/api/slack/oauth/callback/route.ts` | `/api/integrations/slack/oauth/callback` |
| `/api/slack/example-question` | POST | AI-generated example | `apps/chipp-admin/app/api/slack/example-question/route.ts` | Not implemented |
| `/api/integrations/slack/status` | GET | Check connection status | N/A (inline checks) | Already exists |
| `/api/integrations/slack/disconnect` | DELETE | Remove installation | N/A | Already exists |

---

## Migration Recommendations

### Immediate Priority: Add Manifest Generation

The single most impactful improvement is adding the "From manifest" flow to ChippDeno's Slack setup dialog. This eliminates the need for users to manually configure OAuth scopes, event subscriptions, and redirect URLs - everything is auto-configured when they create the app from the manifest.

**Step 1: Create a manifest generation utility** that builds the JSON manifest with:
- Dynamic URLs from the API base URL
- The full set of 12 bot scopes
- All 4 bot events
- The assistant's name and brand color

**Step 2: Update the Step 1 UI** from "Create from scratch" to "Create from manifest":
- Replace the yellow manual instructions box with a manifest preview + Copy/Download buttons
- Change instructions to: "Click 'Create New App' -> From manifest -> Paste the JSON below"

**Step 3: Ensure the correct scopes** match between manifest and OAuth start endpoint:
- Manifest: 12 scopes (chat:write, chat:write.public, app_mentions:read, channels:history, groups:history, im:history, files:write, files:read, channels:join, reactions:write, users:read, users:read.email)
- OAuth: Should request the same scopes

### Implementation Order

1. Add `/api/integrations/slack/config` endpoint that returns dynamic URLs
2. Create a manifest generation helper (can be client-side or server-side)
3. Add a `SlackManifest` Svelte component with Copy/Download buttons
4. Update Step 1 of `SlackSetupDialog.svelte` to show manifest instead of manual instructions
5. Update Step 2 to remove the yellow warning box (manifest handles configuration)
6. (Optional) Add example question generation
7. (Optional) Add "copy mention example" in connected state

### Key Differences to Consider

- **ChippDeno uses Hono** (not Next.js API routes) - routes are in `src/api/routes/`
- **ChippDeno uses Svelte 5** (not React) - the existing dialog is already in Svelte
- **ChippDeno uses Kysely** (not Prisma) - DB queries use query builder syntax
- **ChippDeno uses CSS variables** - the existing dialog already follows this pattern
- **ChippDeno has better UX** - multi-step wizard with step numbers, disconnect, status check

### Files to Reference

1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/SlackManifestSection.tsx` - Manifest generation and display
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/SlackDeploySetupDialog.tsx` - Builder dialog (complete implementation)
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/components/SlackSetupDialog.tsx` - Onboarding dialog variant
4. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/config/route.ts` - Config endpoint
5. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/credentials/route.ts` - Credentials save with encryption
6. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/oauth/start/route.ts` - OAuth initiation
7. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/oauth/callback/route.ts` - OAuth callback with HTML response pages
8. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/slack/example-question/route.ts` - AI example question generator
9. `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (lines 1859-1956) - All Slack-related database models
10. `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/builder/SlackSetupDialog.svelte` - Existing ChippDeno implementation

### Related Features
- [WhatsApp Setup Dialog] - Nearly identical pattern, also in Share/Deploy tab
- [App Builder Share Page] - Parent page that hosts the deploy cards
- [Onboarding Flow] - Share step that also triggers these dialogs
- [Slack Event Handler] - Backend that processes incoming Slack messages
