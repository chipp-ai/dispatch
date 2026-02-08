# Feature Migration Report: WhatsApp Deployment/Integration

## Executive Summary
- **What it does**: Allows developers to connect their Chipp AI agent to WhatsApp Business API so end users can chat with the bot via WhatsApp messages, including support for text, images, audio, video, documents, and stickers.
- **Complexity**: Medium (feature already partially migrated to ChippDeno)
- **Dependencies**: Meta/WhatsApp Business API, GCS for media storage, OpenAI Whisper for audio transcription, Redis for deduplication (ChippMono only), Chat system, Encryption service
- **Recommended approach**: Gap analysis -- ChippDeno already has a nearly complete implementation. Focus on addressing the specific gaps documented below.

## Data Model

### Database Tables

#### `WhatsAppConfig` (chat database in ChippMono, `app.whatsapp_configs` in ChippDeno)
- `id` - UUID primary key
- `applicationId` - Int (unique), links to the application
- `phoneNumberId` - String (encrypted in both systems)
- `businessAccountId` - String (encrypted)
- `accessToken` - Text (encrypted)
- `verificationHash` - String (bcrypt hash, **ChippMono only** -- used for security verification)
- `webhookSecret` - String (UUID, used as Meta's `hub.verify_token`)
- `isActive` - Boolean (default true)
- `isDeleted` - Boolean (default false, soft-delete pattern)
- `createdAt` - DateTime
- `updatedAt` - DateTime
- `groups` - Relation to `WhatsAppGroup[]` (**ChippMono only**)

#### `WhatsAppGroup` (ChippMono only - chat database)
- `id` - UUID primary key
- `groupId` - String (unique)
- `name` - String
- `configId` - FK to WhatsAppConfig
- `isActive` - Boolean (default true)
- `createdAt`, `updatedAt`

#### `ChatSession` additions
- `phoneNumber` - String? (for WhatsApp sessions)
- `source` - Enum includes `WHATSAPP`
- Index on `[applicationId, phoneNumber]` for fast WhatsApp phone lookups

### Schema File Locations
- ChippMono chat DB: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-chat-history-prisma/schema.prisma:115` (WhatsAppConfig)
- ChippMono chat DB: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-chat-history-prisma/schema.prisma:132` (WhatsAppGroup)
- ChippMono main DB: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma:1697` (duplicate WhatsAppConfig, no groups)
- ChippDeno: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/db/migrations/001_initial_schema.sql` (table `app.whatsapp_configs`)

## Implementation Details

### ChippMono Components (3 Variants of Setup Dialog)

There are THREE separate WhatsApp setup dialogs in ChippMono, used in different contexts:

| Component | Context | File |
|-----------|---------|------|
| `WhatsAppDeploySetupDialog` | App Builder > Share > Deploy tab | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/WhatsAppDeploySetupDialog.tsx` |
| `WhatsAppConfig` | Standalone modal (older version) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/whatsappComponents/WhatsAppConfig.tsx` |
| `WhatsAppSetupDialog` | Onboarding v2 flow | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/components/WhatsAppSetupDialog.tsx` |

All three are **functionally identical** -- same fields, same validation, same API calls. The differences are:
1. **WhatsAppDeploySetupDialog**: Opens via "Add Deployment" button inside a Dialog with DialogTrigger
2. **WhatsAppConfig**: Controlled via `isOpen`/`onClose` props, has a "Beta" badge, has `onSuccess` callback
3. **WhatsAppSetupDialog**: Controlled via `open`/`onOpenChange` props, has a loading spinner state on open

### ChippDeno Implementation (Already Exists)

The ChippDeno implementation at `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/components/builder/WhatsAppSetupDialog.svelte` is a **multi-step wizard** that is more polished than any of the ChippMono dialogs:

| Step | Content |
|------|---------|
| `loading` | Spinner while checking connection status |
| `create-app` | "Step 1" -- link to Meta Developer Portal with prerequisites list |
| `webhook` | "Step 2" -- Shows Callback URL to copy, with webhook setup instructions |
| `credentials` | "Step 3" -- Phone Number ID, Business Account ID, Access Token inputs with field hints |
| `connected` | Green checkmark, shows webhook URL + verify token + instructions + disconnect button |

### API Routes

#### ChippMono
| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/whatsapp/config` | GET | Get config (decrypted) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/whatsapp/config/route.ts` |
| `/api/whatsapp/config` | POST | Save/update config | Same file |
| `/api/whatsapp/config` | PATCH | Soft delete (disconnect) | Same file |
| `/api/whatsapp/webhook/[applicationId]` | GET | Meta webhook verification | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/whatsapp/webhook/[applicationId]/route.ts` |
| `/api/whatsapp/webhook/[applicationId]` | POST | Incoming message handler | Same file |

#### ChippDeno
| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/integrations/whatsapp/status` | GET | Check connection status | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/src/api/routes/integrations/whatsapp.ts` |
| `/api/integrations/whatsapp/config` | GET | Get config (masked) | Same file |
| `/api/integrations/whatsapp/config` | POST | Save/update config | Same file |
| `/api/integrations/whatsapp/disconnect` | DELETE | Soft delete | Same file |
| `/api/webhooks/whatsapp/:applicationId` | GET | Meta verification | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/src/api/routes/webhooks/whatsapp.ts` |
| `/api/webhooks/whatsapp/:applicationId` | POST | Incoming messages | Same file |

### Business Logic

#### Config Management
- **Encryption**: All sensitive fields (phoneNumberId, businessAccountId, accessToken) are encrypted at rest
- **Webhook Secret**: Auto-generated UUID on first config creation, used as Meta's `hub.verify_token`
- **Duplicate Prevention**: ChippMono checks if `phoneNumberId` is already used by another app before saving
- **Soft Delete**: PATCH/DELETE sets `isDeleted: true` rather than removing the record
- **Auto-create**: ChippMono's GET endpoint auto-creates a config record (with `isDeleted: true`) if none exists, so `webhookSecret` is always available

#### Webhook Verification (GET)
Standard Meta webhook verification flow:
1. Check `hub.mode === "subscribe"`
2. Validate `hub.verify_token` matches stored `webhookSecret`
3. Return `hub.challenge` as plain text

#### Message Processing (POST)
1. Parse payload, skip status updates
2. Extract message from `body.entry[0].changes[0].value.messages[0]`
3. **Deduplication**: ChippMono uses Redis (`SET NX EX 300`), ChippDeno uses in-memory Set with 5-min TTL
4. Look up WhatsAppConfig, verify not deleted
5. Load application config
6. Determine or create chat session (format: `whatsapp-{from}-{applicationId}[-{timestamp}]`)
7. Session timeout: 90 days -- if last message is older, create new session
8. Load last 10 messages for context
9. Process media if applicable (image, audio, video, document, sticker)
10. Add language instruction to system prompt
11. Call chat handler / agent loop
12. Truncate response to 4096 chars (WhatsApp limit) using semantic sentence-aware truncation
13. Send response via WhatsApp Business API (`POST /v17.0/{phoneNumberId}/messages`)
14. ChippDeno also marks messages as read

#### Media Processing
Both systems support the same 5 media types:

| Type | Processing | Both Systems |
|------|-----------|---|
| `image` | Download -> Upload to GCS -> Send markdown `![](url)` for multimodal | Yes |
| `audio` | Download -> Transcribe with OpenAI Whisper -> Prefix with `[Voice message]` or `[Audio message]` | Yes |
| `video` | Download -> Acknowledge with caption text only (no frame extraction) | Yes |
| `document` | Download -> Read `.txt` directly, acknowledge other types | Yes |
| `sticker` | Download -> Upload to GCS -> Send markdown for vision | Yes |

#### Localized Unsupported Media Messages
ChippMono has **comprehensive i18n** for fallback messages when media processing fails -- 30+ languages per media type (EN, AR, MY, YUE, ZH, ZH_TW, DA, NL, ES, FI, FR, DE, HI, NAN, JA, JV, KM, KO, LO, MG, MS, MN, NO, PT, RU, SN, SW, SV, TL, TH, TR, UK, VI).

ChippDeno has a **minimal version** with only EN, ES, PT.

File: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/whatsapp/unsupportedMediaMessages.ts`

## UI/UX Patterns

### ChippMono Setup Flow (Single-Screen)
The ChippMono setup is a **single-screen form** with all fields visible at once:
1. Access Token (password input)
2. Phone Number ID (with "must be exactly 15 digits" hint)
3. Business Account ID (with "must be 15-16 digits" hint)
4. Separator
5. Callback URL (read-only, click to copy)
6. Verify Token (read-only, click to copy)
7. Save Configuration / Disconnect buttons

### ChippDeno Setup Flow (Multi-Step Wizard)
The ChippDeno setup is a **3-step wizard** that guides users more carefully:
1. **Step 1**: "Create a WhatsApp Business App" -- links to Meta portal, lists prerequisites
2. **Step 2**: "Configure Webhook" -- shows Callback URL to copy, notes about verify token
3. **Step 3**: "Enter Credentials" -- Phone Number ID, Business Account ID, Access Token with field hints

After saving, shows **Connected State** with green checkmark, webhook info, and setup instructions.

### Where WhatsApp Appears
1. **App Builder > Share tab > Deploy sub-tab**: `DeployWhatsAppCard` renders `WhatsAppDeploySetupDialog`
2. **Onboarding v2 > Share step**: "Deploy to platforms" section with WhatsApp option
3. **Plans page**: "Deploy to WhatsApp, Slack, more" listed as a PRO tier benefit

### No Feature Flag Gating
WhatsApp deployment is **NOT gated by any feature flag** in ChippMono. It appears for all users in the Deploy tab. Compare with Email deployment which requires `FEATURE_FLAGS.EMAIL_DEPLOYMENT` and Smartsheet which requires `FEATURE_FLAGS.SMARTSHEET_INTEGRATION`.

## Configuration & Validation

### Input Fields
| Field | Validation | ChippMono | ChippDeno |
|-------|-----------|-----------|-----------|
| Access Token | >= 32 chars, password type | Yes, real-time | Min 1 char only |
| Phone Number ID | Exactly 15 digits (`/^\d{15}$/`) | Yes, real-time with error messages | Min 1 char only |
| Business Account ID | 15-16 digits (`/^\d{15,16}$/`) | Yes, real-time with error messages | Min 1 char only |

**Gap**: ChippDeno validation is much weaker. The Zod schema only checks `z.string().min(1)` while ChippMono has strict regex patterns with toast error messages.

### Webhook URL Format
- ChippMono: `{baseUrl}/api/whatsapp/webhook/{applicationId}` (from `ServiceUrls.whatsapp.webhook()`)
- ChippDeno: `{apiBaseUrl}/api/webhooks/whatsapp/{applicationId}` (note: `/webhooks/` not `/whatsapp/webhook/`)

### Environment Variables
| Variable | Purpose | Used In |
|----------|---------|---------|
| `OPENAI_API_KEY` | Whisper audio transcription | Both |
| `ENCRYPTION_KEY` | Encrypt/decrypt credentials | Both (different implementations) |
| `BASE_URL` | Webhook URL generation | ChippMono |
| `ENVIRONMENT` | Webhook URL generation | ChippDeno |

## Tier Gating

WhatsApp deployment is listed as a **PRO tier benefit** in the Plans page:
- File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/Plans.tsx:203`
- Listed under PRO tier: "Deploy to WhatsApp, Slack, more"
- File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/constants.tsx:8`

However, there is **no runtime enforcement** -- the WhatsApp card appears in the Deploy tab regardless of subscription tier. The tier check is marketing-only (listed on pricing page) but not enforced in the UI or API.

## Connection Testing

### ChippMono
There is **NO automated "test connection" or "send test message" feature** in ChippMono. The documentation at `/Users/hunterhodnett/code/chipp-monorepo/docs/whatsapp/onboarding.md` instructs users to manually test:
1. Use the test WhatsApp number provided by Meta (e.g., 1556232118)
2. Send "Hello" as a test message
3. Verify that Chipp sends an automated response

### ChippDeno
Also **NO automated test connection feature**. The Connected state shows instructions: "Send a message to your WhatsApp number to test"

## Error Handling

### ChippMono
1. **Config fetch failure**: Toast error "Failed to fetch WhatsApp configuration"
2. **Validation errors**: Real-time toast errors for each field (specific messages like "Business Account ID should contain only numbers")
3. **Save failure**: Parses error from API response, shows in toast
4. **Duplicate credentials**: API returns 400 "These WhatsApp credentials are already in use with another application. Please disconnect from the other application first."
5. **Disconnect failure**: Toast error "Failed to disconnect WhatsApp"
6. **Webhook errors**: Sentry error capture with tags for source, feature, applicationId
7. **Media processing errors**: Localized fallback messages sent to user, Sentry capture

### ChippDeno
1. **Config fetch failure**: Falls back to `create-app` step (swallows error)
2. **Validation errors**: Generic "All fields are required" error message
3. **Save failure**: Shows error from API
4. **Disconnect failure**: Shows error in dialog
5. **Webhook errors**: console.error + Sentry capture
6. **Media processing errors**: Fallback messages (fewer languages), Sentry capture
7. **Error recovery**: Sends "Sorry, I encountered an error processing your message. Please try again." on processing failures

## Gaps: ChippMono vs ChippDeno

### Already Implemented in ChippDeno
- Multi-step setup wizard (actually better UX than ChippMono)
- Config CRUD (create, read, update, soft-delete)
- Webhook verification
- Message handling with session management
- Media processing (all 5 types)
- Audio transcription via Whisper
- Semantic text truncation (4096 char limit)
- Mark messages as read (ChippDeno has this, ChippMono does NOT)
- Connected state with webhook info display
- Disconnect functionality

### Missing from ChippDeno
1. **Strict field validation**: ChippMono validates Phone Number ID (exactly 15 digits), Business Account ID (15-16 digits), Access Token (>= 32 chars) with specific error messages. ChippDeno only checks non-empty.
2. **Duplicate credential detection**: ChippMono prevents the same WhatsApp phone from being linked to multiple apps. ChippDeno does not check.
3. **verificationHash field**: ChippMono stores a bcrypt hash of `{accessToken}-{businessAccountId}` for additional security verification. ChippDeno omits this.
4. **Localized unsupported media messages**: ChippMono has 30+ languages. ChippDeno has only EN, ES, PT.
5. **WhatsAppGroup model**: ChippMono has a `WhatsAppGroup` table for group message support. ChippDeno does not support groups.
6. **Redis-based deduplication**: ChippMono uses Redis for cross-pod deduplication. ChippDeno uses in-memory Set (single-process only).
7. **Auto-create config on GET**: ChippMono auto-creates a config record (with `isDeleted: true` and a fresh `webhookSecret`) when none exists. ChippDeno returns 404.
8. **Credit check skip**: ChippMono uses `.skipCreditCheck()` for WhatsApp messages. Need to verify ChippDeno billing context handles this correctly.
9. **Usage tracking for audio transcription**: ChippMono tracks Whisper usage (`trackUnitUsageSync` with `AUDIO_TRANSCRIPTION` source). ChippDeno does not track this.
10. **Churn analytics**: ChippMono tracks `appsWithWhatsApp` in churn events. ChippDeno does not.

### ChippDeno Improvements Over ChippMono
1. **Better UX**: Multi-step wizard with prerequisites list vs single-screen form
2. **Mark as read**: ChippDeno marks incoming messages as read; ChippMono does not
3. **Async message processing**: ChippDeno fires-and-forgets the message handling (responds 200 to Meta immediately); ChippMono processes synchronously (risk of Meta timeout)
4. **Error messages to users**: ChippDeno sends an error message to the WhatsApp user when processing fails; ChippMono just logs the error

## Relevant Postmortem

The Nexa WhatsApp outage on Dec 30-31, 2025 (`/Users/hunterhodnett/code/chipp-monorepo/docs/postmortems/2025-12-31-nexa-whatsapp-outage.md`) is relevant:
- WhatsApp implements 7-day exponential backoff retry for undelivered messages
- Webhook endpoint downtime does NOT cause message loss
- Monitoring WhatsApp webhook health is critical for production deployments

## Related Features
- **Slack Integration** - Similar deployment pattern, uses OAuth instead of manual credentials
- **Email Integration** - Another messaging deployment target, gated behind feature flag
- **Chat System** - WhatsApp messages go through the same chat/agent loop
- **Voice Agents** - Another deployment channel (LiveKit-based)
- **Media Processing** - Shared multimodal message converter pattern

## Files to Reference

### ChippMono
1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/whatsapp/config/route.ts` -- Config CRUD API
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/whatsapp/webhook/[applicationId]/route.ts` -- Webhook handler
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/WhatsAppDeploySetupDialog.tsx` -- Setup UI
4. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/whatsapp/mediaHandler.ts` -- Media processing
5. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/whatsapp/unsupportedMediaMessages.ts` -- Localized fallback messages (30+ languages)
6. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/serviceUrls.ts` -- URL generation
7. `/Users/hunterhodnett/code/chipp-monorepo/docs/whatsapp/onboarding.md` -- Setup instructions

### ChippDeno (Already Implemented)
1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/components/builder/WhatsAppSetupDialog.svelte` -- Setup UI (multi-step wizard)
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/src/api/routes/integrations/whatsapp.ts` -- Config API routes
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/src/api/routes/webhooks/whatsapp.ts` -- Webhook routes
4. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/src/services/whatsapp.service.ts` -- WhatsApp service
5. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/src/services/whatsapp-chat.service.ts` -- Chat handling
6. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/src/services/whatsapp-media.service.ts` -- Media processing

## Recommended Implementation Order (Gap Fixes)

1. **Add strict input validation** to ChippDeno's config save route and UI (Phone Number ID regex, Business Account ID regex, Access Token length)
2. **Add duplicate credential detection** to config save route
3. **Expand localized unsupported media messages** to match ChippMono's 30+ language coverage
4. **Add usage tracking for Whisper transcriptions** if billing tracking is needed
5. **Consider adding Redis-based deduplication** if running multiple pods/processes
6. **Add WhatsApp tier gating** (optional -- runtime enforcement in API/UI if desired)
7. **Test connection feature** (neither system has this -- could be a new improvement)
