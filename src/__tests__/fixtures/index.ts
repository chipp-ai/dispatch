/**
 * Test Fixtures Index
 *
 * Re-exports all fixture modules for convenient imports.
 *
 * USAGE:
 *   import { getFreeUser, createBasicApp, createTextSource } from "../fixtures/index.ts";
 */

// User fixtures
export {
  getFreeUser,
  getProUser,
  getTeamUser,
  getBusinessUser,
  getEnterpriseUser,
  getExhaustedCreditsUser,
  createIsolatedUser,
  createTeamWithMembers,
  resetUserCache,
} from "./users.ts";

// Application fixtures
export {
  createBasicApp,
  createAppWithPrompt,
  createRagAppWithText,
  createRagAppWithUrl,
  createRagAppWithDocument,
  createRagAppWithMultipleSources,
  createAppWithRestAction,
  createAppWithWebhookAction,
  createAppWithChainedActions,
  createVoiceApp,
  createPublishedApp,
  createAppWithCustomDomain,
  createAppWithModel,
  cleanupUserApps,
} from "./applications.ts";

// Organization fixtures
export {
  createFreeOrg,
  createProOrg,
  createOrgWithCredits,
  createOrgWithExhaustedCredits,
  createOrgWithLowCredits,
  createOrgWithFailedPayment,
  createOrgWithMembers,
  createEnterpriseOrg,
  createEnterpriseOrgWithDomain,
  createOrgWithUsage,
  cleanupOrg,
  cleanupAllTestOrgs,
} from "./organizations.ts";

// Knowledge source fixtures
export {
  createTextSource,
  createTextSourceWithChunks,
  createUrlSource,
  createFailedUrlSource,
  createDocumentSource,
  createProcessingDocumentSource,
  createLargeSource,
  createEmptySource,
  generateMockEmbedding,
  generateSimilarEmbeddings,
  generateDissimilarEmbeddings,
  cleanupAppSources,
  cleanupAllTestSources,
} from "./knowledge_sources.ts";

// Consumer fixtures
export {
  createAnonymousConsumer,
  createMultipleAnonymousConsumers,
  createRegisteredConsumer,
  createConsumerWithHistory,
  createConsumerWithMultipleSessions,
  createConsumerWithLead,
  getConsumerAuthHeaders,
  getConsumerCookieHeaders,
  cleanupAppConsumers,
  cleanupAllTestConsumers,
} from "./consumers.ts";

// Voice fixtures
export {
  createVoiceEnabledApp,
  createVoiceAppWithGreeting,
  createVoiceAppWithTools,
  createMockIncomingCall,
  createMockCallStatusUpdate,
  createMockRecordingComplete,
  createMockTranscriptionComplete,
  createMockCompletedCall,
  createMockFailedCall,
  createMockRealtimeSession,
  cleanupVoiceConfigs,
  cleanupTestCalls,
} from "./voice.ts";

// Webhook fixtures
export {
  createStripePaymentSucceededEvent,
  createStripePaymentFailedEvent,
  createStripeSubscriptionCreatedEvent,
  createStripeSubscriptionUpdatedEvent,
  createStripeSubscriptionDeletedEvent,
  createStripeInvoicePaidEvent,
  createStripeInvoicePaymentFailedEvent,
  createStripeMeterEventReportedEvent,
  createStripeSignature,
  createSlackAppMentionEvent,
  createSlackMessageEvent,
  createSlackUrlVerification,
  createMockWebhookResponse,
  createMockWebhookErrorResponse,
  createMockWebhookTimeout,
} from "./webhooks.ts";

// Stripe fixtures
export {
  PRICING_PLANS,
  createMockCustomer,
  createMockCustomerWithPaymentMethod,
  createMockSubscription,
  createMockPastDueSubscription,
  createMockCanceledSubscription,
  createMockV2Subscription,
  createMockInvoice,
  createMockUsageInvoice,
  createMockCreditGrant,
  createMockCreditBalance,
  createMockExhaustedCreditBalance,
  createMockLowCreditBalance,
  createMockPricingPlan,
  createMockBillingIntent,
  getCreditAllowanceForTier,
  getMonthlyPriceForTier,
} from "./stripe.ts";

// Domain fixtures
export {
  createVerifiedDomain,
  createAppDomain,
  createHqDomain,
  createPendingDomain,
  createSslPendingDomain,
  createFailedDomain,
  createExpiredDomain,
  createWhitelabelDomain,
  createDarkModeWhitelabelDomain,
  createBrandedWhitelabelDomain,
  getExpectedDnsRecords,
  createMockDnsLookupResult,
  createMockSslStatus,
  cleanupOrgDomains,
  cleanupAllTestDomains,
} from "./domains.ts";

// Types
export type {
  TestOrganization,
  TestOrgWithMembers,
  TestOrgWithCredits,
} from "./organizations.ts";
export type {
  TestAppWithKnowledge,
  TestAppWithActions,
} from "./applications.ts";
export type {
  TestKnowledgeSource,
  TestTextChunk,
} from "./knowledge_sources.ts";
export type {
  TestConsumer,
  TestConsumerWithHistory,
  TestConsumerWithLead,
} from "./consumers.ts";
export type { TestVoiceApp, TestCall, TwilioWebhookPayload } from "./voice.ts";
export type { StripeWebhookEvent, SlackWebhookEvent } from "./webhooks.ts";
export type {
  SubscriptionTier,
  MockStripeCustomer,
  MockStripeSubscription,
  MockStripeInvoice,
  MockCreditGrant,
  MockCreditBalance,
} from "./stripe.ts";
export type {
  DomainType,
  DomainStatus,
  TestDomain,
  TestDomainWithBranding,
  DnsRecord,
} from "./domains.ts";
