# ChippMono to ChippDeno: Comprehensive Feature Migration Survey

## Overview

This document catalogs all major features and functional areas in the ChippMono codebase (`/Users/hunterhodnett/code/chipp-monorepo`) that are candidates for migration to ChippDeno (`/Users/hunterhodnett/code/chipp-deno`). Each feature is assessed for complexity, dependencies, and priority.

**Already completed migrations (excluded from this survey):**
1. Subscription Tiers & Billing (Plans page, billing settings, upgrade/downgrade flows)
2. Stripe Webhooks (subscription, invoice, checkout, billing alerts, disputes, refunds)

---

## Feature Inventory

### 1. Chat System (Core Engine)

**What it does:** The heart of the platform -- handles streaming AI chat, message history, tool calls, RAG retrieval, image/file generation, and multi-step agent workflows. Includes both the developer test chat and the consumer-facing chat.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/chat/route.ts` -- Main chat endpoint
- `apps/chipp-admin/app/api/chat/v2/` -- V2 chat with chronological tool ordering
- `apps/chipp-admin/app/api/chat/tools/` -- Built-in tool definitions (image gen, web browse, file retrieval, etc.)
- `apps/chipp-admin/app/api/chat/model/` -- LLM model configuration
- `apps/chipp-admin/app/api/chat/knowledgeintegrations/` -- Veeva, etc.
- `apps/chipp-admin/app/api/chat/mcp/` -- MCP OAuth for chat
- `shared/chipp-chat-history-prisma/schema.prisma` -- ChatSession, Message, File, UserMemory models
- `docs/chat-architecture/` -- 10+ docs on async processing, streaming, tool ordering

**Key data models:** `ChatSession`, `Message`, `File`, `UserMemory`, `MemoryOrigin`, `MessageModeration`

**Dependencies:** Knowledge Sources/RAG, Custom Actions, Voice, LLM Adapter, Tool Execution, Memory System

**ChippDeno status:** Has `src/api/routes/chat/index.ts`, `src/services/chat.service.ts` -- basic streaming chat exists but needs to be checked for feature completeness (tool calls, async tools, streaming patterns, MCP integration).

**Priority:** HIGH -- Core product functionality. Everything else depends on this.

---

### 2. Knowledge Sources & RAG Pipeline

**What it does:** Users upload documents (PDF, DOCX, URLs, Google Drive, OneDrive, SharePoint, Notion), which are processed into embeddings and stored for retrieval-augmented generation during chat.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/KnowledgeSourcesSection.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/KnowledgeSourceModal.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/RagSettingsSection.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/knowledgeSources/GoogleDrive/`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/SharepointOneDriveSourceUpload.tsx`
- `apps/chipp-admin/app/(authenticated)/settings/sources/` -- Workspace-level knowledge sources
- `apps/chipp-temporal-worker/src/activities/fileRag/` -- RAG processing activities
- `apps/chipp-temporal-worker/src/activities/documentUpload/` -- Upload processing
- `apps/chipp-temporal-worker/src/workflows/fileRag.ts` -- RAG workflow
- `apps/chipp-temporal-worker/src/workflows/documentUpload.ts`
- `apps/chipp-temporal-worker/src/activities/webScraper.ts` -- URL scraping
- `apps/chipp-temporal-worker/src/workflows/siteCrawler.ts` -- Full site crawling
- `shared/chipp-postgres-prisma/schema.prisma` -- `textchunk`, `document_embeddings`, `application` models
- `docs/knowledge-sources-rag/` -- RAG debugging guide, upload progress, HNSW optimization

**Key data models:** `KnowledgeSource` (in main DB as FileTextchunk), `textchunk`, `document_embeddings` (in embeddings DB)

**Dependencies:** Temporal Workers, File Upload, Google Drive/OneDrive/SharePoint/Notion OAuth, Embedding Provider

**ChippDeno status:** Has `src/api/routes/knowledge-source/index.ts`, `src/services/knowledge-source.service.ts`, `src/services/rag.service.ts`, `src/services/embeddings.service.ts`, `src/services/rag-ingestion.service.ts`, `src/services/local-embeddings.service.ts`. Substantial foundation exists.

**Priority:** HIGH -- Required for AI chatbots to be useful. RAG is a core differentiator.

---

### 3. Custom Actions (API Integrations / Tools)

**What it does:** Users define custom API integrations (REST endpoints) that their chatbots can call as tools. Supports parameter mapping, authentication, tool dependencies (chaining outputs), and an AI-powered parser that auto-configures actions from API docs.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/CustomActionSection.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/CustomActionModal.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/ProActionModal.tsx`
- `apps/chipp-admin/app/api/custom-actions/` -- CRUD API routes
- `apps/chipp-admin/app/api/applications/` -- Application endpoints include tool config
- `docs/custom-actions/` -- Parser prompt, export manifest, tool dependencies
- `docs/tool-dependencies/` -- Tool chaining, nested parameters

**Key data models:** `UserDefinedTool`, `ApplicationVariable`, `ActionTemplate`, `ActionModification`, `ActionContribution`

**Dependencies:** Action Collections, Application Variables, Tool Dependencies system

**ChippDeno status:** Has `src/api/routes/custom-action/index.ts`, `src/services/custom-action.service.ts`, `src/services/tool-execution.service.ts`. Foundation exists.

**Priority:** HIGH -- Power users rely heavily on custom actions for useful chatbots.

---

### 4. Action Collections

**What it does:** Shared, reusable bundles of custom actions that can be imported into applications. Includes a contribution system where users can submit actions to collections.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/action-collections/` -- Collection CRUD, import, sharing
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/action-collections/` -- Contributions UI
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/CollectionActionsSection.tsx`
- `docs/action-collections/` -- Architecture, data flow, security model

**Key data models:** `ActionCollection`, `ActionTemplate`, `ApplicationActionCollection`, `ActionModification`, `ActionContribution`

**Dependencies:** Custom Actions

**ChippDeno status:** Has `src/api/routes/action-collections/index.ts`, `src/services/action-collection.service.ts`, and `CollectionContributions.svelte`. Partial implementation exists.

**Priority:** MEDIUM -- Important for ecosystem but not blocking core functionality.

---

### 5. Application Builder (Build Page)

**What it does:** The main configuration page for an AI app. Includes system prompt, model selection, knowledge sources, custom actions, style/appearance, CTAs, custom CSS, custom components, privacy settings, voice config, and version history.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/BuildPage.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/cards/` -- SetupCard, TrainCard, CustomizeCard, StyleCard, CTACard, PrivacyCard, VoiceCard, ConnectCard, CustomCSSCard, CustomComponentCard, AppVersionCard, TagsCard
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/` -- ModelSwitcher, KnowledgeSourcesSection, CustomActionSection, Chatbot (preview), GeneratePromptModal, ExpandedTextareaModal, etc.
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/session/` -- Test chat session

**Dependencies:** Knowledge Sources, Custom Actions, Voice, Model Selection, Application CRUD

**ChippDeno status:** `BuilderBuildContent.svelte` (656 lines) exists. This is the ChippDeno equivalent. Needs audit to determine completeness vs ChippMono.

**Priority:** HIGH -- This is where developers spend most of their time.

---

### 6. Application Management (CRUD, List, Settings)

**What it does:** Creating, listing, deleting, and configuring applications. Includes app settings (custom domain, custom CSS, language, memory policy, API key, async API, danger zone/delete).

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/applications/` -- App list page
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/settings/` -- App-level settings
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/settings/components/cards/` -- APIKeyCard, AsyncAPICard, CustomCSSCard, CustomDomainCard, CustomInstructionsCard, DangerZoneCard, LanguageCard, MemoryPolicyCard
- `apps/chipp-admin/app/api/applications/` -- Application CRUD API
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/AppBuilderShell.tsx` -- Shell/layout

**Key data models:** `Application`, `ApplicationVersionHistory`, `ApplicationBrandStyles`, `ApplicationCustomDomain`, `ApplicationCredentials`, `ApplicationCapability`, `MemoryPolicy`, `ApplicationAlias`

**Dependencies:** Workspace, Organization

**ChippDeno status:** `Apps.svelte`, `AppBuilderLayout.svelte`, `BuilderSettingsContent.svelte` exist. `src/api/routes/application/index.ts` and `src/services/application.service.ts` exist. Core CRUD likely works but settings may be incomplete.

**Priority:** HIGH -- Foundation for the entire builder experience.

---

### 7. Voice Agents (LiveKit Integration)

**What it does:** Voice-based AI agents powered by LiveKit. Includes phone number management (Twilio SIP), voice session creation, call recording, transcription, and a real-time voice chat UI.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/voice-agent-worker/src/` -- Voice agent worker (billing, config, types)
- `apps/livekit-voice-agent/src/` -- LiveKit voice agent implementation
- `apps/chipp-admin/app/api/livekit/` -- Token, config, SIP dispatch, telephony, webhook
- `apps/chipp-admin/app/api/voice/` -- Session, transcribe-recording, transcript
- `apps/chipp-admin/app/api/phone-numbers/` -- Phone number management
- `apps/chipp-admin/app/api/twilio/` -- Twilio integration
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/cards/VoiceCard.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/voice/`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/calls/CallsPage.tsx`
- `docs/voice/` -- Voice agent docs, billing, frontend integration

**Key data models:** `IncomingCall` (main DB), various LiveKit/Twilio configs

**Dependencies:** Chat System (reuses LLM adapter), Billing (voice minutes tracking), Twilio, LiveKit

**ChippDeno status:** Has `src/api/routes/voice/index.ts`, `BuilderVoiceContent.svelte` (679 lines), `BuilderCallsContent.svelte` (574 lines), `ParticleAudioPage.svelte` (voice UI). `src/services/phone-number.service.ts`, `src/services/call-record.service.ts`, `src/services/outbound-call.service.ts`, `src/services/transcription.service.ts` exist. Substantial foundation.

**Priority:** HIGH -- Key differentiator feature, actively sold.

---

### 8. Consumer Chat Experience

**What it does:** The end-user facing chat interface. Accessed via vanity subdomains (myapp.chipp.ai). Includes consumer authentication (email/password, SSO), lead generation forms, privacy gates, and the full chat UI with streaming, tools, file uploads, etc.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/w/chat/` -- Consumer chat pages (layout, login, signup, SSO, session, purchase, forgot-password)
- `apps/chipp-admin/app/w/chat/[appNameId]/` -- App-specific consumer pages
- `apps/chipp-admin/app/w/chat/components/` -- Consumer UI components
- `apps/chipp-admin/app/w/chat/ChippChatClient.tsx` -- Main consumer chat client
- `apps/chipp-admin/app/w/chat/hooks/` -- Consumer-specific hooks
- `apps/chipp-admin/app/api/consumer/` -- Consumer API
- `apps/chipp-admin/app/api/credits/` -- Consumer credits
- `apps/chipp-admin/app/api/purchases/` -- Consumer purchases
- `apps/chipp-chat-widget/` -- Embeddable Svelte chat widget

**Key data models:** `Consumer`, `ConsumerCredentials`, `Purchase`, `HQConsumer`, `Package`, `Transaction`, `LeadGenerationForm`, `FormSubmission`

**Dependencies:** Chat System, Auth, Billing (consumer credits/purchases), Vanity URL routing

**ChippDeno status:** Has `web/src/routes/consumer/` (ConsumerChat, ConsumerLogin, ConsumerSignup, ConsumerVerify). `src/api/routes/consumer/index.ts`, `src/services/consumer-auth.service.ts`. Foundation exists but likely incomplete.

**Priority:** HIGH -- This is what end users actually see and interact with.

---

### 9. Share & Deploy Page

**What it does:** Deploying chatbots to various channels: share link, iframe embed, widget embed, email, PWA, Slack, WhatsApp, Smartsheet, Voice, and marketplace publishing.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/SharePage.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/` -- ShareLinkCard, ShareIframeCard, ShareWidgetCard, DeployEmailCard, DeployPWACard, DeploySlackCard, DeployWhatsAppCard, DeploySmartsheetCard, DeployVoiceCard
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/publish/` -- PublishModal, SetupScreen, PublishedScreen
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/` -- EmailDeploySetupDialog, PWADeploySetupDialog, SlackDeploySetupDialog, WhatsAppDeploySetupDialog, SmartsheetSetupDialog

**Dependencies:** Slack Integration, WhatsApp Integration, Email Integration, Marketplace, Application Management

**ChippDeno status:** `BuilderShareContent.svelte` (708 lines) exists. Needs audit.

**Priority:** MEDIUM -- Important for distribution but individual channels can be phased.

---

### 10. Slack Integration

**What it does:** Deploy chatbots as Slack bots. Handles OAuth, event subscriptions (messages), thread context, file generation within Slack, and Slack-specific configuration.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/slack/` -- Config, credentials, events, interactions, OAuth, utils
- `shared/chipp-prisma/schema.prisma` -- SlackInstallation, SlackChatMapping, SlackOAuthState, SlackThreadContext, SlackUser, SlackChatSessionUser
- `docs/slack-integration/` -- Design doc, local testing guide

**Key data models:** `SlackInstallation`, `SlackChatMapping`, `SlackOAuthState`, `SlackThreadContext`, `SlackUser`, `SlackChatSessionUser`

**Dependencies:** Chat System, OAuth

**ChippDeno status:** Has `src/api/routes/integrations/slack.ts`, `src/services/slack.service.ts`, `src/services/slack-chat.service.ts`. Foundation exists.

**Priority:** MEDIUM -- Important enterprise integration, many customers use it.

---

### 11. WhatsApp Integration

**What it does:** Deploy chatbots on WhatsApp. Webhook-based message handling, media support, group chat support.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/whatsapp/` -- Config, webhook handler
- `shared/chipp-prisma/schema.prisma` -- WhatsAppConfig
- `shared/chipp-chat-history-prisma/schema.prisma` -- WhatsAppConfig, WhatsAppGroup
- `docs/whatsapp/` -- Onboarding docs

**Key data models:** `WhatsAppConfig` (both main and chat DBs), `WhatsAppGroup`

**Dependencies:** Chat System

**ChippDeno status:** Has `src/api/routes/integrations/whatsapp.ts`, `src/services/whatsapp.service.ts`, `src/services/whatsapp-chat.service.ts`, `src/services/whatsapp-media.service.ts`. Foundation exists.

**Priority:** MEDIUM -- Growing channel, especially for international markets.

---

### 12. Email Integration

**What it does:** Deploy chatbots via email. Users can email their chatbot and receive AI-generated responses.

**Complexity:** SMALL

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/email/` -- Email routes
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/EmailDeploySetupDialog.tsx`
- `shared/chipp-prisma/schema.prisma` -- EmailDeploymentConfig, EmailThread
- `apps/chipp-temporal-worker/src/activities/emailChat.ts`

**Key data models:** `EmailDeploymentConfig`, `EmailThread`

**Dependencies:** Chat System, SendGrid/Email Service

**ChippDeno status:** Has `src/api/routes/integrations/email.ts`, `src/services/email-chat.service.ts`. Foundation exists.

**Priority:** LOW -- Niche use case, fewer users.

---

### 13. Workspace HQ (Storefront)

**What it does:** A public-facing "headquarters" page where workspace owners can showcase their apps. Includes featured apps, consumer auth (sign up to access), QR code sharing, banner/profile images, and invite flows.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/hq/[slug]/` -- HQ page (HQPage, chat, components)
- `apps/chipp-admin/app/hq/[slug]/components/` -- DraggableHQAppCard, HQBannerImageUploader, HQConsumerAuthDialog, HQShareButton, InviteToHQDialog, etc.
- `apps/chipp-admin/app/(authenticated)/settings/hq/` -- HQ settings (access mode, packages, banner, image)
- `apps/chipp-admin/app/api/hq/` -- HQ API routes

**Key data models:** `WorkspaceHQ`, `HQConsumer`, `HQAccessGrant`, `HQPackage`, `CreatorFeaturedApplications`, `WorkspaceHQFeaturedApplications`

**Dependencies:** Workspace, Consumer Auth, Application Management

**ChippDeno status:** Has `HQ.svelte` (599 lines), `settings/content/HQContent.svelte` (896 lines), `src/api/routes/hq/` routes. Substantial implementation.

**Priority:** MEDIUM -- Important for builders who sell to consumers.

---

### 14. Access & Monetization (App-Level)

**What it does:** Controls who can access an app and how it's monetized. Includes email gating, user signup requirements, SSO, API access, domain whitelisting, Stripe Connect for selling, and credit packages.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/access/AccessPage.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/access/components/cards/` -- APIAccessCard, DomainWhitelistingCard, EmailGatingCard, MonetizationCard, RedirectAfterSignupCard, SSOCard, StripeCard, UserSignupCard
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/access/components/` -- PackagesSection, PackagesTable, DeletePackageDialog, EditPackageDialog, NewPackageDialog, EmailGatingDialog, SellStatsSection

**Key data models:** `Package`, `Transaction`, `ApplicationEmailWhitelist`, `Cta`, `ApplicationCredentials`, `ConnectedAccount`, `Purchase`

**Dependencies:** Stripe (Connect), Consumer Auth, Application Management

**ChippDeno status:** `BuilderAccessContent.svelte` (545 lines) and `AppBuilderAccess.svelte` (763 lines) exist. Needs audit.

**Priority:** MEDIUM -- Required for monetized apps.

---

### 15. Chat Logs & Outputs (Chats Tab)

**What it does:** View chat session history, metrics (usage, sources bar chart), download chat logs, manage output integrations (Google Sheets, Smartsheet), and connected outputs.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/chats/ChatPage.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/chats/components/` -- ChatlogList, ChatlogMetrics, ChatlogSourcesBarChart, ChatMemoryTab, DownloadChatlogsCard, ConnectedOutputs, ApplicationOutputAddDialog, GoogleSheets/
- `apps/chipp-admin/app/api/chat-history/` -- Chat history API
- `apps/chipp-admin/app/api/chat-sessions/` -- Chat sessions API
- `apps/chipp-admin/app/api/chat-metrics/` -- Chat metrics API

**Key data models:** `ChatSession`, `Message`, `ViewedChatSession`, `ApplicationOutput`, `GoogleSheet`, `Smartsheet`

**Dependencies:** Chat System, Google Sheets Integration

**ChippDeno status:** `BuilderChatsContent.svelte` (517 lines) and `AppBuilderChats.svelte` (714 lines) exist.

**Priority:** MEDIUM -- Important for understanding chatbot performance.

---

### 16. App Metrics & Analytics

**What it does:** Per-app metrics showing consumers, leads, and transactions. Includes consumer tables, lead tables, and transaction tables.

**Complexity:** SMALL

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/metrics/MetricsPage.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/metrics/fetchApplicationMetrics.ts`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/metrics/components/` -- ConsumersTable, LeadsTable, TransactionsTable
- `apps/chipp-admin/app/api/analytics/` -- Analytics API
- `apps/chipp-admin/app/api/metrics/` -- Metrics API

**Key data models:** `Consumer`, `FormSubmission`, `Transaction`, `TokenUsage`, `AnalyticsEvent`

**Dependencies:** Application Management, Consumer data

**ChippDeno status:** `BuilderMetricsContent.svelte` (421 lines) exists.

**Priority:** LOW -- Nice to have, not blocking core functionality.

---

### 17. Tags & Message Tagging

**What it does:** Auto-tag chat messages based on content. Developers can define tags and the system routes/classifies messages. Includes semantic routing.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/tags/TagsPageContent.tsx`
- `apps/chipp-admin/app/api/applications/` -- Tags are part of application config
- `apps/chipp-admin/app/api/semantic-router/` -- Semantic router API
- `shared/chipp-prisma/schema.prisma` -- MessageTag, MessageTagInstance, SemanticRoute, SemanticRouterDecision, SemanticRouterStats

**Key data models:** `MessageTag`, `MessageTagInstance`, `SemanticRoute`, `SemanticRouteUtterance`, `ApplicationSemanticRouterConfig`

**Dependencies:** Chat System, Embeddings

**ChippDeno status:** `BuilderTagsContent.svelte` (618 lines) and `AppBuilderTags.svelte` (753 lines) exist.

**Priority:** LOW -- Advanced feature, used by power users.

---

### 18. Evals (LLM Evaluation)

**What it does:** Evaluate chatbot responses against defined criteria. Define eval sets, run evaluations, view results.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/evals/EvalsPageContent.tsx`
- `docs/llm-as-judge/` -- Research, implementation, frameworks

**Key data models:** `Eval`, `EvalResult`

**Dependencies:** Chat System, LLM Adapter

**ChippDeno status:** `BuilderEvalsContent.svelte` (1050 lines) exists.

**Priority:** LOW -- Advanced feature for quality assurance.

---

### 19. Dashboard

**What it does:** Main landing page after login showing overview stats, recent apps, activity, and quick actions.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/dashboard/` -- Dashboard page
- `apps/chipp-admin/app/(authenticated)/dashboard-v2/` -- Dashboard V2
- `apps/chipp-admin/app/api/dashboard/` -- Dashboard API routes

**Dependencies:** Application data, Workspace, Organization

**ChippDeno status:** `Dashboard.svelte` (1486 lines) and `DashboardV2.svelte` (1592 lines) exist. Dashboard is likely substantially implemented.

**Priority:** MEDIUM -- First thing users see, but data depends on other features working.

---

### 20. Onboarding Flow

**What it does:** Multi-step onboarding for new users: profile setup, persona selection, team invites, and template selection. Also includes a V2 onboarding with Build -> Train -> Share -> Unlock steps.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/onboarding/` -- V1 onboarding (profile, persona, invite, templates)
- `apps/chipp-admin/app/(authenticated)/onboarding-v2/` -- V2 onboarding
- `apps/chipp-admin/app/api/onboarding-questions/` -- Onboarding questions API
- `apps/chipp-admin/app/api/onboarding-v2/` -- V2 onboarding API

**Key data models:** `OnboardingQuestion`, `Developer` (profile fields)

**Dependencies:** Auth, Application CRUD, Workspace

**ChippDeno status:** `OnboardingLayout.svelte`, `OnboardingV2Layout.svelte`, and content components exist. `src/api/routes/onboarding/index.ts` and `src/api/routes/onboarding-v2/` exist.

**Priority:** MEDIUM -- Important for new user retention.

---

### 21. Team & Organization Management

**What it does:** Manage organization members (invite, remove, change roles), organization settings (name, image, delete), payment invitations, and organization-level configuration.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/settings/team/` -- Team management page
- `apps/chipp-admin/app/(authenticated)/settings/team/components/` -- TeamTable, InviteMemberModal, GeneratePublicInviteLinkDialog, UpgradePlanDialog
- `apps/chipp-admin/app/(authenticated)/settings/organization-settings/` -- Org settings
- `apps/chipp-admin/app/api/organization/` -- Organization API
- `apps/chipp-admin/app/api/settings/` -- Settings API
- `apps/chipp-admin/app/api/payment-invite/` -- Payment invite API
- `apps/chipp-admin/app/auth/joinorganization/` -- Join organization flow

**Key data models:** `Organization`, `OrganizationMember`, `OrganizationInvites`, `PaymentInvitation`

**Dependencies:** Auth, Billing

**ChippDeno status:** `settings/content/TeamContent.svelte` (476 lines), `settings/content/OrganizationSettingsContent.svelte` (669 lines) exist. `src/api/routes/organization/index.ts` exists.

**Priority:** MEDIUM -- Required for team collaboration.

---

### 22. Workspace Management

**What it does:** Create and manage workspaces within an organization. Workspaces contain apps. Includes workspace settings, workspace members, privacy settings, and workspace switching.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/workspaces/` -- Workspaces list
- `apps/chipp-admin/app/(authenticated)/settings/workspace-settings/` -- Workspace settings (delete, leave, transfer, privacy, image)
- `apps/chipp-admin/app/(authenticated)/settings/workspace-members/` -- Workspace members
- `apps/chipp-admin/app/api/workspace/` -- Workspace API
- `apps/chipp-admin/app/api/workspaces/` -- Workspaces list API

**Key data models:** `Workspace`, `WorkspaceMember`, `WorkspaceInvites`, `DataStorageConfig`, `FileBucket`

**Dependencies:** Organization, Auth

**ChippDeno status:** `Workspaces.svelte`, `settings/content/WorkspaceMembersContent.svelte` (991 lines), `settings/content/WorkspaceSettingsContent.svelte` (906 lines) exist. `src/api/routes/workspace/index.ts` exists.

**Priority:** MEDIUM -- Foundation for multi-workspace support.

---

### 23. Memory System

**What it does:** Extract and store user-specific memories from chat conversations. Memory extraction runs as a deferred pipeline. Includes workspace-level memory management (view, edit, delete memories).

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/settings/memory/` -- WorkspaceMemoryPage, WorkspaceMemoryTable, EditWorkspaceMemoryDialog, DeleteWorkspaceMemoryDialog, ClearWorkspaceMemoryDialog
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/consumers/components/UserMemorySection.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/settings/components/cards/MemoryPolicyCard.tsx`
- `shared/chipp-chat-history-prisma/schema.prisma` -- UserMemory, MemoryOrigin
- `docs/memory/` -- Backend architecture, running locally

**Key data models:** `UserMemory`, `MemoryOrigin`, `MemoryPolicy`

**Dependencies:** Chat System, Worker (deferred extraction)

**ChippDeno status:** `settings/content/MemoryContent.svelte` (26 lines -- essentially empty/stub). Needs implementation.

**Priority:** LOW -- Advanced feature, but important for personalization.

---

### 24. Marketplace

**What it does:** Browse and discover published AI apps. Search, filter by tags/use cases, featured apps overlay, and template cards.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/marketplace/` -- Marketplace pages
- `apps/chipp-admin/app/(authenticated)/marketplace/components/` -- MarketplacePage, MarketplaceResultsPage, FeaturedSection, SearchBar, TagSelection, TemplateCard, UseCaseCard, AnimatedHeading, MasonBrick, etc.
- `apps/chipp-admin/app/api/public/` -- Public API (marketplace listings)

**Key data models:** `Application` (published flag), `TemplateCategory`, `ApplicationCategories`

**Dependencies:** Application Management

**ChippDeno status:** `Marketplace.svelte` (587 lines), `MarketplaceResults.svelte` exist. `src/api/routes/marketplace/index.ts` exists.

**Priority:** LOW -- Discovery feature, nice to have.

---

### 25. Enterprise Whitelabel

**What it does:** Full platform white-labeling for enterprise customers. Custom domains, custom branding (colors, logos, fonts), SendGrid email whitelabeling, custom onboarding, and multi-tenant support.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/settings/whitelabel/WhitelabelSettingsPage.tsx`
- `apps/chipp-admin/app/api/whitelabel-config/` -- Whitelabel config API
- `apps/chipp-admin/app/api/domain/` -- Custom domain API
- `apps/chipp-admin/app/api/dns/` -- DNS management
- `apps/chipp-admin/app/api/system-config/` -- System config for whitelabel
- `shared/chipp-prisma/schema.prisma` -- WhitelabelTenant, ApplicationCustomDomain, SystemConfig, FeatureFlag
- `docs/enterprise-whitelabel/` -- Design, theming, SendGrid, onboarding, wildcard subdomains
- `docs/multitenant-whitelabel/` -- Multi-tenant architecture, self-service UI, onboarding runbook

**Key data models:** `WhitelabelTenant`, `ApplicationCustomDomain`, `DNSRecord`, `SystemConfig`, `FeatureFlag`, `CollectionBrandStyles`, `ApplicationBrandStyles`

**Dependencies:** DNS management, SSL certificate provisioning, SendGrid, Custom domains

**ChippDeno status:** `settings/content/WhitelabelContent.svelte` (787 lines) exists. `src/services/whitelabel.service.ts`, `src/services/domain.service.ts` exist.

**Priority:** HIGH -- Enterprise revenue depends on this. Core differentiator for B2B.

---

### 26. Chatbot Generator (AI App Creator)

**What it does:** An AI-powered workflow that generates a complete chatbot configuration from a brief description. Uses AI to create system prompt, suggest model, configure settings.

**Complexity:** SMALL

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/chatbot-generator/` -- Generator pages (actions, components, constants)
- `apps/chipp-admin/app/api/generator/` -- Generator API

**Dependencies:** Application CRUD, AI/LLM

**ChippDeno status:** `ChatbotGenerator.svelte` exists. `src/api/routes/generate/index.ts` exists.

**Priority:** LOW -- Nice-to-have convenience feature.

---

### 27. Admin Panel (Internal)

**What it does:** Internal super-admin dashboard for managing the platform. Includes developer management, app approvals, banned developers, billing migrations, conversion analytics, LLM providers, model fallbacks, organizations, semantic router admin, system config, template categories, usage billing, workspaces, vector search testing, and more.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/admin/` -- 30+ admin pages
- `apps/chipp-admin/app/api/admin/` -- 30+ admin API routes

**Key areas:** app-approvals, banned-developers, billing-migrations, cache-management, conversion-analytics, developer-deletion, developers, document-embeddings, enterprise-provisioning, flagged-messages, leaderboard, llm-health, llm-providers, model-fallbacks, organizations, pro-actions-review, semantic-router, stripe-token-billing, system-config, template-categories, usage-billing, workspaces

**Dependencies:** Everything (admin panel touches all features)

**ChippDeno status:** No admin panel exists in ChippDeno yet.

**Priority:** LOW (for initial migration) -- Internal tool, can be built incrementally as needed. However, some admin functions (like LLM provider config, system config) may be needed for operations.

---

### 28. Auth System (Developer)

**What it does:** Developer authentication via NextAuth (Google OAuth, email/password, magic links, OTP). Includes signup, login, forgot/reset password, email verification, session management, and connected accounts.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/auth/` -- Login, signup, forgot-password, reset-password, joinorganization, joinworkspace, super-admin, verify-email-domain
- `apps/chipp-admin/app/api/auth/` -- NextAuth config, signup, forgot-password, reset-password, OTP, magic-link, connected accounts, Google Drive/Sheets callbacks
- `apps/chipp-admin/app/api/session/` -- Session management

**Key data models:** `Developer`, `DeveloperCredentials`, `DeveloperEmailVerificationOtp`, `DeveloperApiKey`, `DeveloperOAuthToken`, `ConnectedAccount`

**Dependencies:** NextAuth (ChippMono) vs custom auth (ChippDeno)

**ChippDeno status:** Has `Login.svelte`, `Signup.svelte`, `ForgotPassword.svelte`, `ResetPassword.svelte`. `routes/auth.ts` exists with custom Hono-based auth. Already reimplemented differently.

**Priority:** HIGH -- Already substantially done in ChippDeno with different approach. Ongoing maintenance.

---

### 29. File Upload & Storage

**What it does:** Upload files (documents, images, audio) to cloud storage. Used by knowledge sources, chat attachments, profile/workspace images, and audio transcription.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/upload/` -- Upload API
- `apps/chipp-admin/app/api/files/` -- File management API
- `apps/chipp-admin/app/api/downloads/` -- File download API
- `apps/chipp-temporal-worker/src/activities/audioUpload.ts`
- `apps/chipp-temporal-worker/src/activities/audioTranscribe.ts`

**Key data models:** `ApplicationAssistantFile`, `FileTextchunk`, `ApplicationFiles`, `WorkspaceFiles`

**Dependencies:** Cloud Storage (GCS), Temporal Workers

**ChippDeno status:** `src/api/routes/upload/index.ts`, `src/services/upload.service.ts`, `src/services/storage.service.ts` exist.

**Priority:** MEDIUM -- Required by knowledge sources and chat.

---

### 30. Background Jobs & Temporal Workflows

**What it does:** Async processing via Temporal for: RAG ingestion, file processing, web scraping, site crawling, Google Drive/OneDrive/SharePoint/Notion ingestion, audio transcription, video generation, email chat, content moderation, scheduled reports, and subscription cancellation.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/chipp-temporal-worker/src/workflows/` -- 20+ workflow definitions
- `apps/chipp-temporal-worker/src/activities/` -- 30+ activity implementations
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/jobs/` -- Job viewer UI
- `apps/chipp-admin/app/api/jobs/` -- Job history API
- `docs/temporal/` -- Temporal docs, browser pool, site crawling

**Key data models:** `JobHistory`, `VideoGenerationJob`

**Dependencies:** All file processing features, RAG, integrations

**ChippDeno status:** Has `src/services/job.service.ts` and `JobDetail.svelte`. ChippDeno uses a different background processing approach (likely Deno-native or Cloudflare Workers queues rather than Temporal).

**Priority:** MEDIUM -- Critical infrastructure but may be reimplemented differently in ChippDeno.

---

### 31. Google Drive / OneDrive / SharePoint / Notion Integrations

**What it does:** OAuth-based file source integrations allowing users to connect cloud storage and import documents as knowledge sources.

**Complexity:** MEDIUM (each)

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/googledrive/` -- Google Drive API
- `apps/chipp-admin/app/api/googlesheets/` -- Google Sheets API
- `apps/chipp-admin/app/api/onedrive/` -- OneDrive API
- `apps/chipp-admin/app/api/sharepoint/` -- SharePoint API
- `apps/chipp-admin/app/api/notion/` -- Notion API
- `apps/chipp-admin/app/api/microsoft-knowledge-source-auth/` -- Microsoft auth
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/knowledgeSources/GoogleDrive/`
- `apps/chipp-temporal-worker/src/activities/googleDrive/`
- `apps/chipp-temporal-worker/src/activities/sharePointOneDrive/`
- `apps/chipp-temporal-worker/src/activities/notionFetch.ts`

**Key data models:** `ConnectedAccount`, `GoogleSheet`, application-level integrations

**Dependencies:** Knowledge Sources, OAuth, Temporal Workers

**ChippDeno status:** Not yet implemented in ChippDeno routes. No Google Drive/OneDrive/SharePoint/Notion routes visible.

**Priority:** LOW -- Can be added incrementally. URL and file upload cover most use cases.

---

### 32. MCP (Model Context Protocol) Server & OAuth

**What it does:** Hosts MCP servers that allow external AI tools to interact with Chipp apps. Includes OAuth authorization server for MCP clients.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/mcp/oauth/` -- OAuth authorize, register, token, revoke, client-info
- `apps/chipp-mcp-server/` -- Full MCP server application
- `shared/chipp-prisma/schema.prisma` -- McpOAuthClient, McpAuthorizationCode, ConsumerMcpIntegration
- `docs/mcp-server-hosting/` -- Architecture, security, deployment, runtimes

**Key data models:** `McpOAuthClient`, `McpAuthorizationCode`, `ConsumerMcpIntegration`

**Dependencies:** Auth, Application Management

**ChippDeno status:** Has `src/services/mcp-client.service.ts`, `src/services/mcp-integration.service.ts`. Partial.

**Priority:** LOW -- Emerging protocol, important for future but not urgent.

---

### 33. Video Generation (Veo 3)

**What it does:** AI video generation using Google's Veo 3 API. Async workflow with inline rendering in chat messages.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/video-generation/` -- Video gen API (job status, retry)
- `apps/chipp-temporal-worker/src/activities/videoGeneration.ts`
- `apps/chipp-temporal-worker/src/workflows/videoGeneration.ts`
- `docs/veo-video-generation/` -- 8 docs on implementation

**Key data models:** `VideoGenerationJob`

**Dependencies:** Chat System, Temporal Workers, Google Veo API

**ChippDeno status:** Not visible in ChippDeno.

**Priority:** LOW -- Specialized feature, not widely used.

---

### 34. Content Moderation

**What it does:** Automated content moderation for chat messages. Flags inappropriate content.

**Complexity:** SMALL

**Key files/directories (ChippMono):**
- `apps/chipp-temporal-worker/src/activities/contentModeration.ts`
- `apps/chipp-temporal-worker/src/workflows/contentModeration.ts`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/cards/PrivacyCard.tsx`
- `shared/chipp-chat-history-prisma/schema.prisma` -- MessageModeration

**Key data models:** `MessageModeration`

**Dependencies:** Chat System

**ChippDeno status:** Not visible.

**Priority:** LOW -- Required for compliance in some markets.

---

### 35. Import from V1

**What it does:** Import apps and data from ChippMono (V1) to ChippDeno (V2). Migration tool.

**Complexity:** MEDIUM

**Key files/directories (ChippMono):**
- (This is primarily a ChippDeno feature)

**ChippDeno status:** Has `ImportLayout.svelte`, `import/` content pages (Check, Preview, Progress), `src/api/routes/import/index.ts`, `src/services/import.service.ts`.

**Priority:** HIGH -- Critical for user migration from V1 to V2.

---

### 36. Scheduled Reports

**What it does:** Schedule and generate recurring reports on chatbot activity and metrics.

**Complexity:** SMALL

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/reports/` -- Reports API
- `apps/chipp-temporal-worker/src/activities/scheduledReport.ts`
- `apps/chipp-temporal-worker/src/workflows/scheduledReport.ts`

**Key data models:** `CustomReportDefinition`, `CustomReportRequest`, `ReportSchedule`, `ReportGeneration`

**Dependencies:** Analytics, Temporal Workers

**ChippDeno status:** Not visible.

**Priority:** LOW -- Advanced enterprise feature.

---

### 37. Zapier Integration

**What it does:** Zapier triggers and actions for Chipp applications.

**Complexity:** SMALL

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/zapier/` -- Zapier API routes

**Dependencies:** Application Management

**ChippDeno status:** Not visible.

**Priority:** LOW -- Niche integration.

---

### 38. LLM Adapter & Model Configuration

**What it does:** Dynamic LLM provider loading, model selection, model fallback chains, OpenRouter integration, and provider-specific configurations.

**Complexity:** LARGE

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/ModelSwitcher.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/ModelDetailView.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/ModelComparisonModal.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/ModelPricingExplainerModal.tsx`
- `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/RouterPreferences.tsx`
- `apps/chipp-admin/app/api/llm-adapter/` -- LLM adapter API
- `shared/chipp-prisma/schema.prisma` -- LLMProviderConfig, ModelFallbackChain
- `docs/llm-adapter/` -- Logger abstraction, OpenAI ZDR
- `docs/dynamic-llm-provider-loading/`

**Key data models:** `LLMProviderConfig`, `ModelFallbackChain`

**Dependencies:** Chat System

**ChippDeno status:** Has `src/llm/` directory. This is a core piece that likely already exists.

**Priority:** HIGH -- Core to the platform. LLM routing and model selection is foundational.

---

### 39. Application Variables

**What it does:** Define per-app variables that can be injected into system prompts, custom action configurations, and tool parameters.

**Complexity:** SMALL

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/applications/` -- Variables are part of app config
- `shared/chipp-prisma/schema.prisma` -- ApplicationVariable

**Key data models:** `ApplicationVariable`

**Dependencies:** Application Management, Custom Actions

**ChippDeno status:** Has `src/api/routes/application-variable/index.ts`, `src/services/application-variable.service.ts`.

**Priority:** MEDIUM -- Used by custom actions power users.

---

### 40. Feature Flags System

**What it does:** Per-organization feature flags stored in database. Used to gate features, enable whitelabel capabilities, and control access to beta features.

**Complexity:** SMALL

**Key files/directories (ChippMono):**
- `apps/chipp-admin/app/api/featureFlags/` -- Feature flags API
- `shared/chipp-prisma/schema.prisma` -- FeatureFlag
- `docs/features/organization-feature-flags.md`
- `docs/feature-flags/` -- Access page flag, cleanup, migration guide

**Key data models:** `FeatureFlag`

**Dependencies:** Organization

**ChippDeno status:** Feature flags are likely handled differently. Needs investigation.

**Priority:** MEDIUM -- Required for tier gating and enterprise features.

---

---

## Prioritized Migration Roadmap

### Tier 1: HIGH PRIORITY (Core functionality, blocks other features)

| # | Feature | Complexity | Notes |
|---|---------|-----------|-------|
| 1 | Chat System (core engine) | Large | Everything depends on this. Partially exists in ChippDeno. |
| 2 | Knowledge Sources & RAG | Large | Core differentiator. Foundation exists in ChippDeno. |
| 3 | Custom Actions | Large | Power user feature. Foundation exists. |
| 5 | Application Builder (Build Page) | Large | Where developers spend time. Foundation exists. |
| 6 | Application Management | Medium | Foundation exists. Audit needed. |
| 8 | Consumer Chat Experience | Large | What end users see. Foundation exists. |
| 25 | Enterprise Whitelabel | Large | Enterprise revenue depends on this. |
| 28 | Auth System | Medium | Already reimplemented differently in ChippDeno. |
| 35 | Import from V1 | Medium | Critical for migration. Already started in ChippDeno. |
| 38 | LLM Adapter & Model Config | Large | Core infrastructure. Likely partially exists. |

### Tier 2: MEDIUM PRIORITY (Important but not blocking)

| # | Feature | Complexity | Notes |
|---|---------|-----------|-------|
| 4 | Action Collections | Medium | Foundation exists. |
| 7 | Voice Agents | Large | Key differentiator. Foundation exists. |
| 9 | Share & Deploy | Medium | Foundation exists. |
| 10 | Slack Integration | Medium | Enterprise customers use this. |
| 11 | WhatsApp Integration | Medium | Growing market. |
| 13 | Workspace HQ | Medium | Foundation exists. |
| 14 | Access & Monetization | Medium | Required for paid apps. |
| 15 | Chat Logs & Outputs | Medium | Foundation exists. |
| 19 | Dashboard | Medium | Largely implemented. |
| 20 | Onboarding | Medium | Foundation exists. |
| 21 | Team & Organization | Medium | Foundation exists. |
| 22 | Workspace Management | Medium | Foundation exists. |
| 29 | File Upload & Storage | Medium | Foundation exists. |
| 30 | Background Jobs | Large | Different approach in ChippDeno. |
| 39 | Application Variables | Small | Foundation exists. |
| 40 | Feature Flags | Small | May need different approach. |

### Tier 3: LOW PRIORITY (Nice to have, can be deferred)

| # | Feature | Complexity | Notes |
|---|---------|-----------|-------|
| 12 | Email Integration | Small | Niche. Foundation exists. |
| 16 | App Metrics | Small | Foundation exists. |
| 17 | Tags & Semantic Routing | Medium | Advanced. Foundation exists. |
| 18 | Evals | Medium | Advanced. Foundation exists. |
| 23 | Memory System | Medium | Advanced personalization. |
| 24 | Marketplace | Medium | Discovery. Foundation exists. |
| 26 | Chatbot Generator | Small | Convenience. Foundation exists. |
| 27 | Admin Panel | Large | Internal tool. Build incrementally. |
| 31 | Cloud Storage Integrations | Medium | Each one separate. |
| 32 | MCP Server & OAuth | Medium | Emerging protocol. |
| 33 | Video Generation | Medium | Specialized. |
| 34 | Content Moderation | Small | Compliance. |
| 36 | Scheduled Reports | Small | Enterprise. |
| 37 | Zapier Integration | Small | Niche. |

---

## Key Architectural Differences

When migrating any feature, these fundamental differences must be accounted for:

| Aspect | ChippMono | ChippDeno |
|--------|-----------|-----------|
| Web Framework | Next.js 14 (React, SSR) | Hono (API) + Svelte 5 (SPA) |
| Database ORM | Prisma (3 separate clients) | Kysely (single PostgreSQL) |
| Database | MySQL (main, chat) + PostgreSQL (embeddings) | Single PostgreSQL |
| Background Jobs | Temporal workflows/activities | Deno-native / Cloudflare Workers |
| State Management | MobX stores | Svelte stores ($state rune) |
| Auth | NextAuth (Google OAuth) | Custom Hono auth middleware |
| Styling | MUI / Tailwind / CSS modules | Tailwind + CSS variables (white-label ready) |
| Deployment | Kubernetes + Cloud SQL + Temporal | Deno Deploy + Cloudflare Workers |
| Routing | File-system routing (Next.js /app) | Hash-based SPA routing (svelte-spa-router) |

---

## Recommended Next Migrations

Based on the survey, the recommended next migration targets are:

1. **Audit existing ChippDeno implementations** -- Many features have foundations that may be 50-80% complete. A systematic audit would identify gaps more efficiently than building from scratch.

2. **Consumer Chat Experience** -- High priority, partially built. The consumer-facing chat is what end users interact with and drives platform value.

3. **Enterprise Whitelabel** -- High revenue impact. Foundation exists in ChippDeno. Needs systematic comparison against ChippMono implementation.

4. **Chat System completeness audit** -- The chat engine exists but may be missing advanced features like async tools, MCP integration, tool ordering, etc.

5. **Knowledge Sources completeness** -- RAG foundation exists. Check for missing upload types, processing pipelines, and UI features.

---

*Generated: 2026-02-05*
*Source: ChippMono at `/Users/hunterhodnett/code/chipp-monorepo`*
*Target: ChippDeno at `/Users/hunterhodnett/code/chipp-deno`*
