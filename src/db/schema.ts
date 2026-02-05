/**
 * Database Schema Types
 *
 * Type definitions for Kysely query builder with CamelCasePlugin.
 * Property names are camelCase to match what Kysely returns after transformation.
 * The CamelCasePlugin handles snake_case <-> camelCase conversion automatically.
 */

import type { Generated, ColumnType } from "kysely";

// ========================================
// JSON Types (for sql.json() compatibility)
// ========================================

export type JSONPrimitive = string | number | boolean | null;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;

// ========================================
// Core Types
// ========================================

export type SubscriptionTier =
  | "FREE"
  | "PRO"
  | "TEAM"
  | "BUSINESS"
  | "ENTERPRISE";
export type UserRole = "owner" | "admin" | "member" | "viewer";
export type WorkspaceMemberRole = "OWNER" | "EDITOR" | "VIEWER";
export type WorkspaceInviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED";
export type HQAccessMode = "public" | "public_paid" | "private" | "paid";
export type MessageRole = "user" | "assistant" | "system" | "tool";

export type JobHistoryStatus =
  | "PENDING"
  | "ACTIVE"
  | "COMPLETE"
  | "ERROR"
  | "CANCELLED";

export type JobHistoryType =
  | "FILE_UPLOAD"
  | "URL_CRAWL"
  | "YOUTUBE_UPLOAD"
  | "TIKTOK_UPLOAD"
  | "INSTAGRAM_UPLOAD"
  | "FACEBOOK_UPLOAD"
  | "NOTION_UPLOAD"
  | "GOOGLE_DRIVE_UPLOAD"
  | "SHAREPOINT_ONEDRIVE_UPLOAD"
  | "AUDIO_UPLOAD"
  | "PODCAST_UPLOAD"
  | "API_UPLOAD"
  | "CHAT_BATCH"
  | "VIDEO_GENERATION";

export type CollectionSharingScope = "PRIVATE" | "WORKSPACE" | "PUBLIC";

export type ProActionCategory =
  | "PRODUCTIVITY"
  | "COMMUNICATION"
  | "DATA"
  | "AI_ML"
  | "MARKETING"
  | "DEVELOPER"
  | "FINANCE"
  | "HR"
  | "CUSTOMER_SERVICE"
  | "OTHER";

export type ProActionReviewStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_CHANGES";

export type ContributionStatus = "PENDING" | "APPROVED" | "REJECTED" | "MERGED";

export type ImportStatus = "pending" | "running" | "completed" | "failed";
export type ImportProgressStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

// ========================================
// App Schema Tables
// ========================================

export interface OrganizationTable {
  id: Generated<string>;
  name: string;
  slug: string | null;
  subscriptionTier: SubscriptionTier;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  usageBasedBillingEnabled: boolean;
  trialEndsAt: Date | null;
  creditsBalance: number;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface UserTable {
  id: Generated<string>;
  email: string;
  name: string | null;
  picture: string | null;
  role: UserRole;
  organizationId: string;
  activeWorkspaceId: string | null;
  oauthProvider: string | null;
  oauthId: string | null;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  passwordHash: string | null;
  resetToken: string | null;
  resetTokenExpiry: Date | null;
  magicLinkToken: string | null;
  magicLinkExpiry: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface OtpVerificationTable {
  id: Generated<string>;
  email: string;
  otpCode: string;
  expiresAt: Date;
  verifiedAt: Date | null;
  attempts: Generated<number>;
  createdAt: Generated<Date>;
}

export interface WorkspaceTable {
  id: Generated<string>;
  name: string;
  organizationId: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface WorkspaceMemberTable {
  id: Generated<string>;
  workspaceId: string;
  userId: string;
  role: WorkspaceMemberRole;
  joinedAt: Generated<Date>;
  joinedViaPublicInvite: boolean;
  latestActivity: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface WorkspaceHQTable {
  id: Generated<string>;
  workspaceId: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  pictureUrl: string | null;
  bannerUrl: string | null;
  videoUrl: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  accessMode: HQAccessMode;
  isVerified: boolean;
  isHqPublic: boolean;
  allowDuplicateApps: boolean;
  featuredApplicationIds: unknown; // JSONB array of app IDs
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface WorkspaceInviteTable {
  id: Generated<string>;
  workspaceId: string;
  email: string;
  role: WorkspaceMemberRole;
  status: WorkspaceInviteStatus;
  token: string;
  tokenExpiresAt: Date;
  tokenHasBeenUsed: boolean;
  acceptedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface UserOnboardingTable {
  id: Generated<string>;
  userId: string;
  questionSlug: string;
  question: string;
  options: unknown | null; // JSONB
  answer: unknown | null; // JSONB
  version: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ApplicationTable {
  id: Generated<string>;
  name: string;
  appNameId: string; // slug - maps to app_name_id column
  description: string | null;
  pictureUrl: string | null;
  systemPrompt: string | null;
  workspaceId: string | null;
  developerId: string; // creator - maps to developer_id column
  organizationId: string | null;
  model: string; // model ID string
  temperature: number;
  brandStyles: unknown | null; // JSONB
  capabilities: unknown | null; // JSONB
  welcomeMessages: unknown | null; // JSONB
  suggestedMessages: unknown | null; // JSONB
  leadFormConfig: unknown | null; // JSONB
  customActions: unknown | null; // JSONB
  settings: unknown | null; // JSONB
  language: string | null;
  isActive: boolean;
  isPublic: boolean;
  isDeleted: boolean;
  launchedVersionId: string | null;
  lastLaunchedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ApplicationCredentialTable {
  id: Generated<string>;
  applicationId: string;
  apiKeyHash: string;
  apiKeyPrefix: string;
  name: string;
  lastUsedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface SessionTable {
  id: Generated<string>;
  userId: string;
  expiresAt: Generated<Date>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Generated<Date>;
}

// ========================================
// Chat Schema Tables
// ========================================

export type ChatSessionMode = "ai" | "human" | "hybrid";

export interface ChatSessionTable {
  id: Generated<string>;
  applicationId: string;
  consumerId: string | null;
  title: string | null;
  source: string;
  mode: ChatSessionMode;
  takenOverBy: string | null;
  isBookmarked: boolean;
  externalId: string | null;
  metadata: unknown | null; // JSONB
  startedAt: Generated<Date>;
  endedAt: Date | null;
}

export interface MessageTable {
  id: Generated<string>;
  sessionId: string;
  role: MessageRole;
  content: string;
  toolCalls: unknown | null; // JSONB
  toolResults: unknown | null; // JSONB
  model: string | null;
  tokenCount: number | null;
  latencyMs: number | null;
  tags: unknown | null; // JSONB
  audioUrl: string | null;
  audioDurationMs: number | null;
  videoUrl: string | null;
  videoMimeType: string | null;
  createdAt: Generated<Date>;
}

export interface UserMemoryTable {
  id: Generated<string>;
  applicationId: string;
  consumerId: string | null;
  externalUserId: string | null;
  memoryType: string;
  content: string;
  sourceMessageId: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ViewedSessionTable {
  id: Generated<string>;
  sessionId: string;
  userId: string;
  viewedAt: Generated<Date>;
}

export interface TagTable {
  id: Generated<string>;
  applicationId: string;
  name: string;
  color: string;
  createdAt: Generated<Date>;
}

export interface MessageTagTable {
  id: Generated<string>;
  messageId: string;
  tagId: string;
  createdAt: Generated<Date>;
}

// ========================================
// RAG Schema Tables
// ========================================

export interface KnowledgeSourceTable {
  id: Generated<string>;
  applicationId: string;
  name: string;
  type: string; // knowledge_source_type enum
  url: string | null;
  filePath: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "deleting";
  errorMessage: string | null;
  chunkCount: number;
  metadata: unknown; // JSONB
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface TextChunkTable {
  id: Generated<string>;
  knowledgeSourceId: string;
  content: string;
  metadata: unknown; // JSONB
  embedding: unknown | null; // vector(1536)
  createdAt: Generated<Date>;
}

// ========================================
// Billing Schema Tables
// ========================================

export interface TokenUsageTable {
  id: Generated<number>; // BIGSERIAL
  applicationId: string;
  organizationId: string | null;
  sessionId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: ColumnType<string, string, string> | null; // DECIMAL
  createdAt: Generated<Date>;
}

export interface JobHistoryTable {
  id: Generated<number>;
  applicationId: string;
  workflowId: string; // Temporal workflow ID
  jobType: JobHistoryType;
  status: JobHistoryStatus;
  displayName: string | null; // e.g., "example.pdf" or "https://example.com"
  metadata: unknown | null; // JSONB
  errorMessage: string | null;
  startedAt: Generated<Date>;
  completedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface UserDefinedToolTable {
  id: Generated<string>;
  applicationId: string;
  name: string;
  slug: string | null;
  description: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers: ColumnType<unknown[]>;
  pathParams: ColumnType<unknown[]>;
  queryParams: ColumnType<unknown[]>;
  bodyParams: ColumnType<unknown[]>;
  variables: ColumnType<unknown> | null;
  presentTenseVerb: string | null;
  pastTenseVerb: string | null;
  collectionId: string | null;
  originalActionId: string | null;
  isClientSide: boolean;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ApplicationVariableTable {
  id: Generated<string>;
  applicationId: string;
  name: string;
  label: string;
  type: string;
  description: string | null;
  required: boolean;
  placeholder: string | null;
  value: string | null;
  isEncrypted: boolean;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ConnectedAccountTable {
  id: Generated<string>;
  provider: string;
  providerAccountId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ApplicationVersionHistoryTable {
  id: Generated<string>;
  applicationId: string;
  userId: string | null;
  version: Generated<string>;
  data: unknown; // JSONB of changed fields
  tag: string | null; // Optional release tag (e.g., "v1.0")
  isLaunched: boolean;
  launchedAt: Date | null;
  createdAt: Generated<Date>;
}

// ========================================
// Voice/Calls Tables
// ========================================

export interface IncomingCallTable {
  id: Generated<number>;
  applicationId: number;
  callSid: string; // Twilio call SID
  callId: string; // Internal call ID
  fromNumber: string;
  dialedNumber: string;
  recordingSid: string | null;
  recordingDuration: number | null; // Duration in seconds
  transcript: string | null;
  transcriptionData: unknown | null; // JSONB
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

// ========================================
// Action Collections Tables
// ========================================

export interface ActionCollectionTable {
  id: Generated<string>;
  name: string;
  description: string;
  slug: string;

  sharingScope: CollectionSharingScope;

  // Owner information
  createdBy: string;
  workspaceId: string | null;

  // Pro action fields (only used when sharingScope = PUBLIC)
  category: ProActionCategory | null;
  isPremium: boolean;
  isFeatured: boolean;
  reviewStatus: ProActionReviewStatus | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;

  // Common fields
  isActive: boolean;
  version: string;

  // Metadata
  coverImage: string | null;
  icon: string | null;
  tags: unknown; // JSONB

  // Usage tracking
  installCount: number;
  lastUsedAt: Date | null;

  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ActionCollectionActionTable {
  id: Generated<string>;
  collectionId: string;

  // Action template data (serialized as JSON)
  actionData: unknown; // JSONB

  // Action ordering within collection
  sortOrder: number;

  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ActionContributionTable {
  id: Generated<string>;
  collectionId: string;
  actionId: string; // Reference to the action in the collection

  contributorId: string;
  contribution: unknown; // JSONB - the proposed changes
  description: string; // Explanation of changes

  status: ContributionStatus;
  reviewedBy: string | null;
  reviewNotes: string | null;
  reviewedAt: Date | null;

  createdAt: Generated<Date>;
}

// ========================================
// Whitelabel Tables
// ========================================

export interface WhitelabelTenantTable {
  id: Generated<string>;
  slug: string;
  name: string;
  customDomain: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  features: unknown; // JSONB
  organizationId: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

// ========================================
// Custom Domains Tables
// ========================================

export type CustomDomainType = "chat" | "dashboard" | "api";
export type CustomDomainSslStatus = "pending" | "active" | "expired" | "failed";
export type Mode = "TEST" | "LIVE";

export interface CustomDomainTable {
  id: Generated<string>;
  hostname: string;
  type: CustomDomainType;

  // Foreign keys (one will be set based on type)
  appId: string | null;
  tenantId: string | null;
  organizationId: string | null;

  // Cloudflare tracking
  cloudflareId: string | null;
  sslStatus: CustomDomainSslStatus;
  dcvToken: string | null;

  // Brand styles cache (for fast KV lookup)
  brandStyles: unknown | null;

  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

// ========================================
// Consumer Tables (End-user auth for chat apps)
// ========================================

export interface ConsumerTable {
  id: Generated<string>;
  applicationId: string;

  // Identity
  identifier: string; // Usually email, unique per app
  email: string | null;
  name: string | null;
  pictureUrl: string | null;

  // Auth
  passwordHash: string | null;
  emailVerified: boolean;
  magicLinkToken: string | null;
  magicLinkExpiry: Date | null;
  resetToken: string | null;
  resetTokenExpiry: Date | null;

  // Subscription/Credits
  credits: number;
  subscriptionActive: boolean;
  stripeCustomerId: string | null;

  // Mode (TEST/LIVE) - for backwards compatibility during migration
  mode: Mode;

  // Soft delete
  isDeleted: boolean;

  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ConsumerSessionTable {
  id: Generated<string>;
  consumerId: string;
  applicationId: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Generated<Date>;
}

export interface ConsumerOtpTable {
  id: Generated<string>;
  email: string;
  applicationId: string;
  otpCode: string;
  expiresAt: Date;
  attempts: Generated<number>;
  createdAt: Generated<Date>;
}

export interface ApplicationEmailWhitelistTable {
  id: Generated<string>;
  applicationId: string;
  email: string;
  createdAt: Generated<Date>;
}

export interface BookmarkTable {
  id: Generated<string>;
  consumerId: string;
  messageId: string;
  note: string | null;
  createdAt: Generated<Date>;
}

export interface PurchaseTable {
  id: Generated<string>;
  consumerId: string;
  applicationId: string;
  stripePaymentIntentId: string | null;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  creditsGranted: number;
  mode: Mode;
  createdAt: Generated<Date>;
}

// ========================================
// MCP Integration Tables
// ========================================

export interface ApplicationIntegrationTable {
  id: Generated<string>;
  name: string | null;
  logo: string | null;
  isActive: boolean;
  applicationId: string;

  // MCP remote server integration
  mcpServerUrl: string | null;
  mcpTransport: string | null;
  mcpAuthType: string | null;
  mcpAuthConfig: string | null; // encrypted JSON
  mcpToolCache: unknown | null; // JSONB

  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface IntegrationActionTable {
  id: Generated<string>;
  name: string | null;
  isActive: boolean;
  integrationId: string;

  // MCP tool reference
  remoteToolName: string | null;
  schemaSnapshot: unknown | null; // JSONB

  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

// ========================================
// Import Schema Tables
// ========================================

export interface ImportSessionTable {
  id: Generated<string>;
  userId: string;
  sourceDeveloperId: number;
  sourceEmail: string;
  status: ImportStatus;
  currentPhase: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ImportProgressTable {
  id: Generated<string>;
  importSessionId: string;
  entityType: string;
  totalCount: number;
  completedCount: number;
  status: ImportProgressStatus;
  errorMessage: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ImportIdMappingTable {
  id: Generated<string>;
  importSessionId: string;
  entityType: string;
  oldId: string;
  newId: string;
  createdAt: Generated<Date>;
}

export interface WelcomeScreenViewTable {
  id: Generated<string>;
  email: string;
  seenAt: Generated<Date>;
  userId: string | null;
  createdAt: Generated<Date>;
}

// ========================================
// Slack Integration Tables
// ========================================

export interface SlackInstallationTable {
  id: Generated<number>;
  workspaceTeamId: string;
  slackAppId: string;
  slackClientId: string | null;
  slackClientSecret: string | null; // Encrypted
  workspaceName: string | null;
  botToken: string; // Encrypted
  signingSecret: string | null; // Encrypted
  installedById: number | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SlackChatMappingTable {
  id: Generated<number>;
  slackInstallationId: number;
  chatName: string; // Shortened app identifier
  applicationId: string; // UUID reference to Application
  createdAt: Generated<Date>;
}

export interface SlackOAuthStateTable {
  id: Generated<number>;
  state: string; // Random UUID for CSRF protection
  applicationId: string; // UUID reference to Application
  developerId: string; // UUID reference to User
  expiresAt: Date;
  createdAt: Generated<Date>;
}

export interface SlackThreadContextTable {
  threadTs: string; // Primary key
  channelId: string | null;
  workspaceTeamId: string;
  slackAppId: string;
  chatName: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SlackUserTable {
  id: Generated<number>;
  slackUserId: string; // U...
  workspaceTeamId: string;
  email: string | null;
  realName: string | null;
  displayName: string | null;
  avatar: string | null;
  title: string | null;
  timezone: string | null;
  statusText: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

// ========================================
// WhatsApp Integration Tables
// ========================================

export interface WhatsAppConfigTable {
  id: Generated<string>;
  applicationId: string; // UUID reference to Application
  phoneNumberId: string; // Encrypted - WhatsApp Phone Number ID
  businessAccountId: string; // Encrypted - WhatsApp Business Account ID
  accessToken: string; // Encrypted - Permanent access token
  webhookSecret: string; // UUID for hub.verify_token validation
  isActive: boolean;
  isDeleted: boolean; // Soft delete
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

// ========================================
// Email Integration Tables
// ========================================

export interface EmailConfigTable {
  id: Generated<string>;
  applicationId: string; // UUID reference to Application
  postmarkServerToken: string | null; // Encrypted, optional for shared infrastructure
  postmarkMessageStream: string; // Default: "inbound"
  webhookUsername: string; // Encrypted
  webhookPassword: string; // Encrypted, used as token query param
  useSharedInfrastructure: boolean;
  inboundEmailAddress: string;
  fromEmailAddress: string;
  fromEmailName: string;
  enableWhitelist: boolean;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface EmailThreadTable {
  id: Generated<string>;
  emailConfigId: string;
  threadId: string; // SHA256 hash (16 chars) of root Message-ID
  subject: string;
  chatSessionId: string;
  firstMessageId: string; // Original Message-ID
  participants: unknown; // JSON array
  isActive: boolean;
  messageCount: number;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

// ========================================
// Database Interface
// ========================================

export interface Database {
  // App schema
  "app.organizations": OrganizationTable;
  "app.users": UserTable;
  "app.sessions": SessionTable;
  "app.otp_verifications": OtpVerificationTable;
  "app.workspaces": WorkspaceTable;
  "app.workspace_members": WorkspaceMemberTable;
  "app.workspace_hq": WorkspaceHQTable;
  "app.workspace_invites": WorkspaceInviteTable;
  "app.user_onboarding": UserOnboardingTable;
  "app.applications": ApplicationTable;
  "app.application_credentials": ApplicationCredentialTable;

  // Chat schema
  "chat.sessions": ChatSessionTable;
  "chat.messages": MessageTable;
  "chat.user_memories": UserMemoryTable;
  "chat.viewed_sessions": ViewedSessionTable;
  "chat.tags": TagTable;
  "chat.message_tags": MessageTagTable;

  // RAG schema
  "rag.knowledge_sources": KnowledgeSourceTable;
  "rag.text_chunks": TextChunkTable;

  // Custom actions schema
  "app.user_defined_tools": UserDefinedToolTable;
  "app.application_variables": ApplicationVariableTable;
  "app.connected_accounts": ConnectedAccountTable;
  "app.application_version_history": ApplicationVersionHistoryTable;

  // Billing schema
  "billing.token_usage": TokenUsageTable;

  // Job history
  "app.job_history": JobHistoryTable;

  // Whitelabel schema
  "app.whitelabel_tenants": WhitelabelTenantTable;

  // Custom domains schema
  "app.custom_domains": CustomDomainTable;

  // Voice/Calls schema (uses main db, note: table name is IncomingCall in Prisma)
  "app.incoming_calls": IncomingCallTable;

  // Action collections schema
  "app.action_collections": ActionCollectionTable;
  "app.action_collection_actions": ActionCollectionActionTable;
  "app.action_contributions": ActionContributionTable;

  // MCP integration schema
  "app.application_integrations": ApplicationIntegrationTable;
  "app.integration_actions": IntegrationActionTable;

  // Consumer schema (end-user auth for chat apps)
  "app.consumers": ConsumerTable;
  "app.consumer_sessions": ConsumerSessionTable;
  "app.consumer_otps": ConsumerOtpTable;
  "app.application_email_whitelist": ApplicationEmailWhitelistTable;
  "app.bookmarks": BookmarkTable;
  "app.purchases": PurchaseTable;

  // Import schema
  "app.import_sessions": ImportSessionTable;
  "app.import_progress": ImportProgressTable;
  "app.import_id_mappings": ImportIdMappingTable;

  // Welcome screen tracking
  "app.welcome_screen_views": WelcomeScreenViewTable;

  // Slack integration schema
  "app.slack_installations": SlackInstallationTable;
  "app.slack_chat_mappings": SlackChatMappingTable;
  "app.slack_oauth_states": SlackOAuthStateTable;
  "app.slack_thread_contexts": SlackThreadContextTable;
  "app.slack_users": SlackUserTable;

  // WhatsApp integration schema
  "app.whatsapp_configs": WhatsAppConfigTable;

  // Email integration schema
  "app.email_configs": EmailConfigTable;
  "app.email_threads": EmailThreadTable;
}

// ========================================
// Helper Types (Selectable versions - what you get from queries)
// ========================================

import type { Selectable } from "kysely";

export type Organization = Selectable<OrganizationTable>;
export type User = Selectable<UserTable>;
export type Workspace = Selectable<WorkspaceTable>;
export type WorkspaceMember = Selectable<WorkspaceMemberTable>;
export type WorkspaceInvite = Selectable<WorkspaceInviteTable>;
export type UserOnboarding = Selectable<UserOnboardingTable>;
export type Application = Selectable<ApplicationTable>;
export type ApplicationCredential = Selectable<ApplicationCredentialTable>;
export type Session = Selectable<SessionTable>;
export type ChatSession = Selectable<ChatSessionTable>;
export type Message = Selectable<MessageTable>;
export type UserMemory = Selectable<UserMemoryTable>;
export type ViewedSession = Selectable<ViewedSessionTable>;
export type Tag = Selectable<TagTable>;
export type MessageTag = Selectable<MessageTagTable>;
export type KnowledgeSource = Selectable<KnowledgeSourceTable>;
export type TextChunk = Selectable<TextChunkTable>;
export type TokenUsage = Selectable<TokenUsageTable>;
export type JobHistory = Selectable<JobHistoryTable>;
export type UserDefinedTool = Selectable<UserDefinedToolTable>;
export type ApplicationVariable = Selectable<ApplicationVariableTable>;
export type ConnectedAccount = Selectable<ConnectedAccountTable>;
export type ApplicationVersionHistory =
  Selectable<ApplicationVersionHistoryTable>;
export type WhitelabelTenant = Selectable<WhitelabelTenantTable>;
export type CustomDomain = Selectable<CustomDomainTable>;
export type IncomingCall = Selectable<IncomingCallTable>;
export type ActionCollection = Selectable<ActionCollectionTable>;
export type ActionCollectionAction = Selectable<ActionCollectionActionTable>;
export type ActionContribution = Selectable<ActionContributionTable>;
export type Consumer = Selectable<ConsumerTable>;
export type ConsumerSession = Selectable<ConsumerSessionTable>;
export type ConsumerOtp = Selectable<ConsumerOtpTable>;
export type ApplicationEmailWhitelist =
  Selectable<ApplicationEmailWhitelistTable>;
export type Bookmark = Selectable<BookmarkTable>;
export type Purchase = Selectable<PurchaseTable>;
export type ApplicationIntegration = Selectable<ApplicationIntegrationTable>;
export type IntegrationAction = Selectable<IntegrationActionTable>;
export type WelcomeScreenView = Selectable<WelcomeScreenViewTable>;

// Slack integration types
export type SlackInstallation = Selectable<SlackInstallationTable>;
export type SlackChatMapping = Selectable<SlackChatMappingTable>;
export type SlackOAuthState = Selectable<SlackOAuthStateTable>;
export type SlackThreadContext = Selectable<SlackThreadContextTable>;
export type SlackUser = Selectable<SlackUserTable>;

// WhatsApp integration types
export type WhatsAppConfig = Selectable<WhatsAppConfigTable>;

// Email integration types
export type EmailConfig = Selectable<EmailConfigTable>;
export type EmailThread = Selectable<EmailThreadTable>;
