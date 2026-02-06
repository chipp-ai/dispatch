# Feature Migration Report: App Generator API

## Executive Summary

- **What it does**: Multi-step AI-powered app creation flow that takes a user's natural language idea and generates a complete AI assistant app (name, description, system prompt, logo, conversation starters, welcome message) using 6 sequential LLM calls, then persists it to the database with all related entities.
- **Complexity**: High -- 6 sequential LLM API calls, 2 code paths (landing/unauthenticated vs dashboard/authenticated), AI image generation with dual-provider fallback (OpenAI + Gemini), SSE streaming for URL knowledge sources, company email domain detection with optional website crawling.
- **Dependencies**: OpenAI API (gpt-4.1 and gpt-image-1), Google Generative AI (fallback), Google Cloud Storage (logo upload), Application CRUD service, Knowledge Source system (URL crawling), Company email domain detection utility.
- **ChippDeno status**: Partially implemented. The API routes at `/generate/*` exist and the Svelte `appGenerator` store + `AppGenerator.svelte` component are present but use simplified prompts and a simplified `createApplication()` call that is missing logo generation, brand styles, splash screens, and company knowledge integration.

---

## Architecture Overview

### Two Distinct Flows

```
FLOW 1: Landing Page (unauthenticated start)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

chipp-landing                    chipp-admin
┌─────────────────┐              ┌──────────────────────────────┐
│ PromptGenerator │  redirect    │ /create-app-from-landing     │
│ (textarea)      │─────────────>│ page.tsx (server component)  │
│                 │  ?d=base64   │   - requires auth            │
│ GetStartedModal │  ?source=    │   - fetches developer info   │
│ (login/signup)  │  appGenerator│   - renders client.tsx       │
└─────────────────┘              │                              │
                                 │ client.tsx                   │
                                 │   - decodes prompt from URL  │
                                 │   - calls useAppGeneration() │
                                 │   - shows progress UI        │
                                 │   - optional: company website│
                                 │   - shows success screen     │
                                 └──────────────────────────────┘

FLOW 2: Dashboard (authenticated)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

chipp-admin
┌──────────────────────┐
│ /chatbot-generator   │
│ MainPage.tsx         │
│   - inline textarea  │
│   - calls same APIs  │
│   - different UI     │
└──────────────────────┘
```

### Generation Pipeline (7-8 Steps)

```
Step 1: generateAppDetails()          -> name, description, primaryColor
Step 2: generateLogoDescription()     -> logoDescription text
Step 3: generateSystemPrompt()        -> system prompt (full)
Step 4: generateConversationStarters() -> 4 conversation starters
Step 5: generateStartingMessage()     -> optional welcome message
Step 6: createApplication()           -> DB persist + logo generation + slug
Step 7: generateSplashScreens()       -> 10 PWA splash sizes
Step 8: addCompanyWebsiteKnowledge()  -> CONDITIONAL: only if company email
```

---

## API Endpoints

### Public Generation Endpoints (No Auth Required)

These are called from the frontend during the generation progress screen. In ChippMono they live at `/api/public/generate-*`. In ChippDeno they are at `/generate/*`.

| Step | ChippMono Endpoint | ChippDeno Endpoint | Method | Purpose |
|------|--------------------|--------------------|--------|---------|
| 1 | `POST /api/public/generate-app-details` | `POST /generate/app-details` | POST | Generate name, description, color |
| 2 | `POST /api/public/generate-logo-description` | `POST /generate/logo-description` | POST | Generate logo description text |
| 3 | `POST /api/public/generate-prompt` | `POST /generate/prompt` | POST | Generate system prompt |
| 4 | `POST /api/public/generate-conversation-starters` | `POST /generate/conversation-starters` | POST | Generate 4 conversation starters |
| 5 | `POST /api/public/generate-starting-message` | `POST /generate/starting-message` | POST | Generate optional welcome message |
| 6 | `POST /api/generate-app-facts` | `POST /generate/app-facts` | POST | Generate success screen facts (requires auth in ChippMono) |

### Authenticated Endpoints

| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `POST /api/applications` | POST | Create app in DB (main endpoint) | `apps/chipp-admin/app/api/applications/route.ts` |
| `POST /api/applications/:id/splash-screens` | POST | Generate PWA splash screens | separate route file |
| `GET /api/upload/url` | GET | SSE stream for URL crawling (knowledge source) | `apps/chipp-admin/app/api/upload/url/route.ts` |
| `GET /api/generator` | GET | SSE stream for anonymous URL crawling | `apps/chipp-admin/app/api/generator/route.ts` |
| `POST /api/generator/application` | POST | Create app (legacy/anonymous path) | `apps/chipp-admin/app/api/generator/application/route.ts` |
| `GET /api/generator/url` | GET | SSE stream for authenticated URL crawling | `apps/chipp-admin/app/api/generator/url/route.ts` |

---

## Request/Response Formats

### Step 1: Generate App Details

**Request:**
```json
{ "userInput": "A chatbot that helps accountants with tax questions" }
```

**Response:**
```json
{
  "appTitle": "TaxSage",
  "appDescription": "Your AI tax advisor that helps accountants navigate complex tax scenarios and maximize client deductions",
  "primaryColor": "#2D5F9A"
}
```

**LLM**: `gpt-4.1` (ChippMono) / `gpt-4o-mini` (ChippDeno -- GAP)

**Validation**: Title max 30 chars, description max 200 chars, hex color regex. ChippMono has a regeneration loop if fields exceed limits (calls gpt-4o-mini to shorten). ChippDeno just truncates.

### Step 2: Generate Logo Description

**Request:**
```json
{
  "userInput": "A chatbot that helps accountants with tax questions",
  "appName": "TaxSage",
  "appDescription": "Your AI tax advisor...",
  "primaryColor": "#2D5F9A"
}
```

**Response:**
```json
{
  "logoDescription": "A square app icon with a solid #2D5F9A background featuring a large, bold white calculator icon..."
}
```

### Step 3: Generate System Prompt

**Request:**
```json
{ "userInput": "A chatbot that helps accountants with tax questions" }
```

**Response:**
```json
{
  "prompt": "# Tax Advisory AI\n\nYou are an expert tax advisor specializing in..."
}
```

**LLM**: `gpt-4.1` with the full `promptGeneratorPrompt` system prompt (316 lines). ChippDeno uses a minimal 5-line system prompt -- significant GAP.

**Source of full prompt**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/constants.ts`

### Step 4: Generate Conversation Starters

**Request:**
```json
{
  "userInput": "...",
  "appName": "TaxSage",
  "appDescription": "...",
  "systemPrompt": "# Tax Advisory AI..."
}
```

**Response:**
```json
{
  "conversationStarters": [
    "Find deductions I might be missing",
    "Explain the new tax brackets",
    "Review my depreciation schedule",
    "Compare filing status options"
  ]
}
```

### Step 5: Generate Starting Message

**Request:** Same as Step 4.

**Response:**
```json
{
  "shouldHaveStartingMessage": true,
  "startingMessage": "Welcome! I'm TaxSage, your AI tax advisor. What tax questions can I help you with today?",
  "reasoningText": "Tax assistants benefit from a welcoming message..."
}
```

### Step 6: Create Application

**Request:**
```json
{
  "name": "TaxSage",
  "description": "Your AI tax advisor...",
  "workspaceId": "42",
  "systemPrompt": "# Tax Advisory AI...",
  "suggestions": ["Find deductions...", "Explain...", "Review...", "Compare..."],
  "brandStyles": { "primaryColor": "#2D5F9A" },
  "logoDescription": "A square app icon...",
  "creationSource": "landing-generator",
  "startingMessage": "Welcome! I'm TaxSage..."
}
```

**Response:** Full Application object with all relations.

### Step 6b: Generate App Facts (for success screen)

**Request:**
```json
{
  "name": "TaxSage",
  "description": "Your AI tax advisor...",
  "systemPrompt": "# Tax Advisory AI...",
  "hasCompanyKnowledge": false
}
```

**Response:**
```json
{
  "facts": [
    "analyze tax scenarios",
    "find overlooked deductions",
    "explain tax code changes"
  ]
}
```

---

## Data Models

### Application (Main DB)

**Schema file**: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma:134`

Key fields set during generation:
| Column | Type | Default | Set During Generation |
|--------|------|---------|----------------------|
| `name` | String | "New Application" | Yes - from AI |
| `description` | String (Text) | "Your cool app description" | Yes - from AI |
| `brandStyles` | Json | {} | Yes - `{ primaryColor, logoUrl }` |
| `startingFreeTrialTokens` | Int | 100 | Yes (hardcoded) |
| `monetizationEnabled` | Boolean | false | Yes (hardcoded) |
| `chatType` | Enum | ChippHosted | Yes (hardcoded) |
| `isDraft` | Boolean | false | Yes |
| `creationSource` | String | "dashboard" | Yes - "landing-generator" |
| `startingMessage` | String (LongText) | null | Yes - from AI |

### ApplicationCredentials

**Schema file**: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma:483`

Created FIRST, before the Application:
| Column | Type | Value |
|--------|------|-------|
| `testApiKey` | String | `test_` + random |
| `liveApiKey` | String | `live_` + random |
| `systemPrompt` | String (MediumText) | AI-generated prompt |
| `model` | String | `CLAUDE_SONNET_4_5` (or `HERMES_3_LLAMA_3_1_70B` if PG mode) |

### ApplicationBrandStyles

**Schema file**: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma:511`

Created as a nested relation during Application creation:
| Column | Type | Value |
|--------|------|-------|
| `primaryColor` | String | AI-generated hex |
| `logoUrl` | String | Generated image URL or default |
| `userMessageFontColor` | String | "#FFFFFF" |

### Related Entities Created

1. **ApplicationCredentials** - API keys + system prompt + model
2. **Application** - Main record
3. **ApplicationBrandStyles** - Colors + logo URL
4. **ApplicationCapability[]** - Default capabilities
5. **Package** - Default package (name: "Default Package", price: 2.99, tokens: 100)
6. **Suggestion[]** - 4 conversation starters
7. **ApplicationAlias** - URL slug
8. **Consumer** - Developer added as consumer of own app
9. **WorkspaceHQ** - Auto-featured for FREE tier
10. **Splash screens** - 10 PWA splash screen sizes (async)

### Entity Creation Sequence

```
1. Generate API keys (test + live)
2. Create ApplicationCredentials (systemPrompt, model, keys)
3. Build application data object with nested creates:
   - Application (main fields)
   - ApplicationBrandStyles (nested create)
   - ApplicationCapability[] (nested createMany)
   - Package (nested create)
   - Suggestion[] (nested createMany)
4. prisma.application.create(applicationData)
5. Create ApplicationAlias (slug)
6. Create Consumer (developer as consumer)
7. Auto-feature in WorkspaceHQ (FREE tier only)
8. Refetch with all relations
```

---

## Logo Generation Pipeline

**Source**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/logo/generateLogoFromDescription.ts`

```
Logo Description (text)
  -> generateLogoFromDescriptionWithOpenAI()   [primary]
     -> OpenAI gpt-4.1-mini with image_generation tool
     -> 1024x1024 PNG, low quality (fast)
     -> Buffer -> /tmp file -> GCS upload -> URL
  -> generateLogoFromDescriptionWithGemini()   [fallback]
  -> Default image URL on total failure
```

**OpenAI Implementation**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/logo/generateLogoFromDescriptionWithOpenAI.ts`

Key details:
- Uses `openai.responses.create()` with `tools: [{ type: "image_generation" }]`
- Model: `gpt-4.1-mini`
- Size: `1024x1024`, Quality: `low` (fastest, 272 tokens)
- Output: PNG, base64 encoded
- Upload destination: GCS `application-logos/` folder
- Default fallback: `https://app.chipp.ai/assets/default-images/default-app-image.png`
- Environment variable: `OPENAI_IMAGE_GEN_API_KEY` (or `OPENAI_API_KEY`)

**ChippDeno GAP**: Logo generation is NOT implemented. The `createApplication()` call in the Svelte store does not pass `logoDescription` or `brandStyles`. The API route at `POST /api/applications` does not invoke any image generation.

---

## Authentication Flow

### Landing Page Path (Primary)

1. User enters prompt on `chipp-landing` homepage
2. If logged in: redirect to `app.chipp.ai/create-app-from-landing?d=base64(prompt)&source=appGenerator`
3. If NOT logged in: show GetStartedModal which links to `app.chipp.ai/auth/signup?d=base64(prompt)&source=appGenerator`
4. After signup/login: user is redirected to `/create-app-from-landing?d=...&source=appGenerator`
5. Server component (`page.tsx`) checks auth:
   - If no session -> redirect to `/auth/login?callbackUrl=/create-app-from-landing?d=...`
   - If session -> fetch developer info server-side, render `client.tsx`
6. Client component decodes `?d=` param from URL, calls `createApp(userPrompt)`
7. All `/api/public/generate-*` calls are unauthenticated (CORS enabled)
8. `POST /api/applications` call IS authenticated (uses session cookie)
9. After creation: shows success screen, then navigates to `/app_builder/:id/build`

### Dashboard Path

1. User is already authenticated
2. Navigate to `/chatbot-generator`
3. Enter prompt in inline textarea
4. Same API calls but uses session-authenticated endpoints

### Anonymous Generator Path (Legacy)

There is a legacy anonymous path using `ANON_EMAIL = "anonymous-generator@chipp.ai"`:
- `/api/generator` (GET) - SSE stream for URL crawling, uses anonymous developer
- `/api/generator/application` (POST) - Creates app for anonymous developer

This path requires a special developer record with email `anonymous-generator@chipp.ai` in the database.

---

## Company Email Domain Detection

**Source**: `shared-utils/src/emailDomainDetection.ts`

When a user has a company email (not gmail, outlook, etc.), the flow:
1. Detects company domain from email (e.g., `user@acme.com` -> `acme.com`)
2. Shows a modal offering to add company website as knowledge source
3. If user accepts: calls `/api/upload/url` with `crawlAllLinks=true`
4. SSE stream provides progress updates during crawling
5. After completion, regenerates app facts with `hasCompanyKnowledge: true`
6. Shows updated success screen

---

## Error Handling

1. **Individual LLM call failures**: Each `generate*` function throws on `!response.ok`. The main `createApp()` function catches all errors and sets `error` state.
2. **Logo generation failure**: Returns default logo URL, does not fail app creation.
3. **Splash screen failure**: Shows toast warning, continues to success screen.
4. **Starting message failure**: Silently continues without starting message.
5. **Company knowledge failure**: Continues to success screen regardless.
6. **App facts failure**: Falls back to hardcoded default facts.
7. **Field validation failure**: LLM output too long -> regeneration loop (ChippMono) or truncation (ChippDeno).
8. **Sentry integration**: All public generate endpoints have explicit Sentry capture with tags `source` and `feature: "app-creation"`.

---

## Environment Variables

| Variable | Purpose | Used In |
|----------|---------|---------|
| `OPENAI_API_KEY` | Primary OpenAI key for LLM calls | generate-* routes |
| `OPENAI_IMAGE_GEN_API_KEY` | Separate key for image generation (optional, falls back to OPENAI_API_KEY) | logo generation |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini fallback for logo generation | logo generation |
| `BASE_URL` | Server URL for internal API calls | splash screen generation |
| `USE_TOKEN_BILLING` | If "true", ensures Stripe customer exists before app creation | applications route |

---

## ChippDeno Current State vs Gaps

### What Exists in ChippDeno

1. **API routes** at `/generate/*` (6 endpoints): `/Users/hunterhodnett/code/chipp-deno/src/api/routes/generate/index.ts`
2. **Svelte store** `appGenerator`: `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/stores/appGenerator.ts`
3. **Svelte component** `AppGenerator.svelte`: `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/AppGenerator.svelte`
4. **Svelte subcomponents** `AppGeneratorProgress.svelte`, `AppGeneratorSuccess.svelte`

### Critical Gaps

| Gap | Priority | Description |
|-----|----------|-------------|
| **Model downgrade** | High | ChippDeno uses `gpt-4o-mini` for all generation. ChippMono uses `gpt-4.1` for app details, prompt, conversation starters, starting message, and logo description. Quality difference is significant. |
| **System prompt for prompt generation** | High | ChippDeno has a 5-line placeholder. ChippMono has a 316-line expert prompt generator prompt covering all domains, tool patterns, and knowledge base detection. |
| **Logo generation** | High | ChippDeno does not generate logos at all. ChippMono uses OpenAI `gpt-4.1-mini` image generation with Gemini fallback, uploads to GCS. |
| **Brand styles persistence** | High | ChippDeno `createApplication()` call does not pass `brandStyles`, `logoDescription`, `creationSource`, or `startingMessage`. |
| **Splash screen generation** | Medium | Not implemented in ChippDeno. |
| **Company email detection** | Medium | Not implemented in ChippDeno. Company website modal, knowledge source crawling missing. |
| **Field validation + regeneration** | Medium | ChippDeno just truncates. ChippMono calls a secondary LLM to shorten fields that exceed limits. |
| **Suggestions (conversation starters) persistence** | Medium | ChippDeno `createApplication()` passes `suggestions` but the API route may not persist them as `Suggestion` records. |
| **CORS headers on public routes** | Low | ChippMono has explicit CORS headers with `Access-Control-Allow-Origin: *` on public generate routes. ChippDeno routes are on the same origin so may not need them. |
| **Anonymous generator path** | Low | Legacy path using `ANON_EMAIL`. Probably not needed in ChippDeno. |
| **Sentry error tracking** | Low | ChippMono has explicit Sentry captures on all generation endpoints. |

---

## Files to Reference

### ChippMono Source Files

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-app-details/route.ts` | App details generation with validation |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-prompt/route.ts` | System prompt generation |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-conversation-starters/route.ts` | Conversation starters |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-starting-message/route.ts` | Starting message |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-logo-description/route.ts` | Logo description |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/generate-app-facts/route.ts` | App facts for success screen |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/applications/route.ts` | Main application CRUD (POST handler) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/application/createNewApplicationForDeveloper/index.ts` | Core creation service |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/application/createNewApplicationForDeveloper/newApplicationStartingData.ts` | Default data builder |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/logo/generateLogoFromDescription.ts` | Logo generation orchestrator |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/logo/generateLogoFromDescriptionWithOpenAI.ts` | OpenAI image generation |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/constants.ts` | `promptGeneratorPrompt` (316-line system prompt) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/hooks/useAppGeneration.ts` | Main generation orchestration hook |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/services/appGenerationService.ts` | API service layer |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/types.ts` | TypeScript types |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/constants.ts` | Constants, endpoints, loading states |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/utils/stageUtils.ts` | Stage/task management utilities |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/client.tsx` | Client component (progress UI) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/page.tsx` | Server component (auth check) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/AppGenerationProgress.tsx` | Progress display component |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/SuccessScreen.tsx` | Success screen with facts |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/CompanyWebsiteModal.tsx` | Company knowledge offer |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/hero-section/content/prompt-generator.tsx` | Landing page prompt input |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/get-started-modal.tsx` | Landing page signup modal |

### ChippDeno Files to Update

| File | What to change |
|------|----------------|
| `/Users/hunterhodnett/code/chipp-deno/src/api/routes/generate/index.ts` | Upgrade model to gpt-4.1, port full system prompts, add field validation/regeneration |
| `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/stores/appGenerator.ts` | Add brandStyles, logoDescription, startingMessage, creationSource to createApplication call |
| `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/AppGenerator.svelte` | Already exists, may need UI updates |
| `/Users/hunterhodnett/code/chipp-deno/src/api/routes/application/index.ts` | Ensure POST handler accepts all fields and creates all related entities |
| `/Users/hunterhodnett/code/chipp-deno/src/services/application.service.ts` | Port entity creation sequence (credentials, brand styles, capabilities, package, suggestions, alias, consumer, workspace HQ auto-feature) |

---

## Full promptGeneratorPrompt

The most important piece of IP in this system is the 316-line system prompt used for generating app system prompts. It covers:

- One-shot generation from any input
- Knowledge base detection (when to include KB section)
- Structured prompt template with 10+ sections
- Inference rules per domain (Technical, Educational, Business, Creative, Personal)
- Tool usage patterns per domain (8 domain-specific tool strategies)
- Input examples with expected approach
- Quality guarantees
- Edge case handling for vague input

**Full source**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/constants.ts`

This should be ported to ChippDeno verbatim or improved.

---

## Migration Recommendations

### Implementation Order

1. **Port the full `promptGeneratorPrompt`** to ChippDeno generate routes (highest impact, lowest effort)
2. **Upgrade models** from `gpt-4o-mini` to `gpt-4.1` in generate routes
3. **Add field validation/regeneration** logic for title (30 chars) and description (200 chars)
4. **Update `createApplication()` in the store** to pass all fields (brandStyles, logoDescription, suggestions, creationSource, startingMessage)
5. **Update the application service** to create all related entities (credentials, brand styles, capabilities, package, suggestions, alias, consumer)
6. **Implement logo generation** using OpenAI image generation API with R2/GCS upload
7. **Add company email detection** and knowledge source integration
8. **Add splash screen generation** (lower priority)

### Key Architecture Differences

| Aspect | ChippMono | ChippDeno |
|--------|-----------|-----------|
| **Framework** | Next.js API routes | Hono routes |
| **ORM** | Prisma | Kysely |
| **Frontend** | React + Next.js | Svelte 5 SPA |
| **State** | React hooks (useAppGeneration) | Svelte writable store (appGenerator) |
| **Auth** | NextAuth session | Custom session middleware |
| **File storage** | Google Cloud Storage | R2 (Cloudflare) |
| **Image generation** | OpenAI + Gemini fallback | Not implemented |
| **URL crawling** | Custom AddSingleUrlSource + SSE | Existing but separate |

### Non-Obvious Details

1. **ApplicationCredentials is created BEFORE Application** - it has an `id` that is passed to the Application create call as `applicationCredentialsId`.
2. **Default model is `CLAUDE_SONNET_4_5`** (not GPT) - this is the model the created app will use for chat, not the generation model.
3. **Auto-featuring for FREE tier** - newly created apps are automatically added to the WorkspaceHQ featured list if the user is on FREE tier.
4. **Slug creation** - an `ApplicationAlias` record is created immediately with `isPrimary: true` using `getShortenedAppIdentifier()`.
5. **Developer as consumer** - the developer is added as a consumer of their own app with starting credits.
6. **Splash screens are fire-and-forget in POST /api/applications** - they are triggered via an internal fetch() that is not awaited. But in the create-app-from-landing flow, they are awaited synchronously.
7. **The prompt encoding uses `btoa(encodeURIComponent(prompt))`** - double encoding to handle special characters in URL params.
8. **Company knowledge is optional and interruptible** - user can skip it, and if it fails, the flow continues.

---

## Related Features

- **Knowledge Sources / RAG** - The company website crawling uses the same AddSingleUrlSource system. See `docs/migrations/` for RAG documentation.
- **Application Builder** - After generation, user is redirected to `/app_builder/:id/build` where they can customize everything.
- **Onboarding v2** - Template apps use the same `createNewApplicationForDeveloper` service. See `apps/chipp-admin/app/api/onboarding-v2/create-template-apps/route.ts`.
- **PWA / Splash Screens** - Splash screen generation is a separate system that creates 10 sizes from the app logo.
- **Application Cloning** - `POST /api/developer/clone-app` also creates applications but via a different path.
