/**
 * Onboarding V2 Flow Definition
 *
 * 4-step flow: Build → Train → Share → Unlock
 * Train step has 3 sub-steps: Website → Files → Integrations
 *
 * Features:
 * - Split-view layout with live chat preview
 * - Template selection or "Build Your Own" with AI generation
 * - File upload and website crawling
 * - Share options (link, embed, widget, PWA)
 * - Pricing/unlock step
 */

export type OnboardingStep = "build" | "train" | "share" | "unlock";
export type TrainSubStep = "website" | "files" | "integrations";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "build",
  "train",
  "share",
  "unlock",
];

export const TRAIN_SUB_STEPS: TrainSubStep[] = [
  "website",
  "files",
  "integrations",
];

export interface StepConfig {
  id: OnboardingStep;
  order: number;
  label: string;
  description: string;
  icon: string;
  skippable: boolean;
}

export interface TrainSubStepConfig {
  id: TrainSubStep;
  order: number;
  label: string;
  icon: string;
  iconBackground: string;
  iconColor: string;
  skippable: boolean;
}

export const STEP_CONFIG: Record<OnboardingStep, StepConfig> = {
  build: {
    id: "build",
    order: 1,
    label: "Build",
    description: "Choose a template or build your own AI assistant",
    icon: "Sparkles",
    skippable: false,
  },
  train: {
    id: "train",
    order: 2,
    label: "Train",
    description: "Add knowledge sources to your AI",
    icon: "BookOpen",
    skippable: false,
  },
  share: {
    id: "share",
    order: 3,
    label: "Share",
    description: "Get your AI live on your website",
    icon: "Share2",
    skippable: false,
  },
  unlock: {
    id: "unlock",
    order: 4,
    label: "Unlock",
    description: "Choose a plan to unlock full features",
    icon: "Unlock",
    skippable: false,
  },
};

export const TRAIN_SUB_STEP_CONFIG: Record<TrainSubStep, TrainSubStepConfig> = {
  website: {
    id: "website",
    order: 1,
    label: "Website",
    icon: "Globe",
    iconBackground: "bg-blue-100",
    iconColor: "text-blue-600",
    skippable: true,
  },
  files: {
    id: "files",
    order: 2,
    label: "Files",
    icon: "FileText",
    iconBackground: "bg-green-100",
    iconColor: "text-green-600",
    skippable: true,
  },
  integrations: {
    id: "integrations",
    order: 3,
    label: "Integrations",
    icon: "Plug",
    iconBackground: "bg-purple-100",
    iconColor: "text-purple-600",
    skippable: true,
  },
};

export interface OnboardingTemplate {
  id: string;
  name: string;
  description: string;
  subtitle: string;
  icon: string;
  brandColor: string;
  logoUrl: string;
  startingMessage: string;
  suggestions: string[];
  systemPrompt: string;
}

export const ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: "website-chat",
    name: "Website Assistant",
    description:
      "Turn every visitor into an engaged lead with instant, intelligent answers",
    subtitle: "24/7 lead capture & nurturing",
    icon: "Globe",
    brandColor: "#2563EB",
    logoUrl:
      "https://storage.googleapis.com/chipp-images/application-logos/bf1d907c-6382-4334-ad4e-2300816b9e44.svg",
    startingMessage:
      "Hey! I can answer any questions about what we do and help you find exactly what you're looking for. What brings you here today?",
    suggestions: [
      "What makes you different from competitors?",
      "Can you walk me through your pricing?",
      "What results have your customers seen?",
      "How quickly can I get started?",
    ],
    systemPrompt: `You are a high-converting website assistant designed to turn curious visitors into qualified leads.

## Core Behaviors
- **Opening**: Greet warmly and ask what brought them to the site today
- **Discovery**: Ask strategic questions to understand their needs and timeline
- **Value**: Connect their specific pain points to relevant solutions
- **Urgency**: Create gentle urgency without being pushy
- **Capture**: Naturally collect contact info when they show buying signals

## Conversation Style
- Friendly but professional
- Concise responses (2-3 sentences max)
- Ask one question at a time
- Use their name once you learn it
- Mirror their communication style

## Lead Qualification
Gather these naturally through conversation:
1. What problem they're trying to solve
2. Timeline for making a decision
3. Budget range (if appropriate)
4. Who else is involved in the decision
5. Email for follow-up

## Key Phrases
- "What's prompting you to look into this now?"
- "If we could solve [their problem], what would that mean for you?"
- "Would it be helpful if I sent you more details?"

Never be pushy. Build rapport first, qualify second, capture third.`,
  },
  {
    id: "support-agent",
    name: "Support Agent",
    description: "Resolve customer issues instantly with AI-powered support",
    subtitle: "24/7 customer support",
    icon: "Headphones",
    brandColor: "#059669",
    logoUrl:
      "https://storage.googleapis.com/chipp-images/application-logos/12518e42-5c95-4d26-abfb-ec324752b212.svg",
    startingMessage:
      "Hi there! I'm here to help you with any questions or issues. What can I assist you with today?",
    suggestions: [
      "I'm having trouble logging in",
      "How do I reset my password?",
      "I need help with my order",
      "Can I speak to a human?",
    ],
    systemPrompt: `You are a patient and helpful customer support agent focused on resolving issues quickly and completely.

## Core Behaviors
- **Acknowledge**: Start by acknowledging their issue and showing empathy
- **Clarify**: Ask specific questions to understand the full problem
- **Solve**: Provide step-by-step solutions when possible
- **Verify**: Confirm the issue is resolved before ending
- **Escalate**: Know when to hand off to a human agent

## Conversation Style
- Patient and understanding
- Clear, simple language
- Step-by-step instructions
- Proactive in offering additional help

## Issue Resolution Framework
1. Understand the problem completely
2. Check for common solutions first
3. Provide clear action steps
4. Follow up to confirm resolution
5. Offer related help proactively

## Escalation Triggers
- Customer explicitly requests human help
- Technical issues requiring account access
- Billing disputes or refund requests
- Complaints about service quality
- After 3 failed solution attempts

## Key Phrases
- "I understand how frustrating that must be."
- "Let me help you fix that right away."
- "Did that solve the issue for you?"
- "Is there anything else I can help with?"

Always prioritize customer satisfaction over efficiency.`,
  },
  {
    id: "lead-qualifier",
    name: "Lead Qualifier",
    description:
      "Qualify leads automatically and book meetings while you sleep",
    subtitle: "Automated lead scoring & booking",
    icon: "Target",
    brandColor: "#7C3AED",
    logoUrl:
      "https://storage.googleapis.com/chipp-images/application-logos/42edca9f-4d2e-4353-b6f5-73133007c264.svg",
    startingMessage:
      "Welcome! I'd love to learn more about what you're looking for. Are you exploring solutions for yourself or your team?",
    suggestions: [
      "I want to learn more about your product",
      "What's your pricing?",
      "Can I book a demo?",
      "How does this compare to alternatives?",
    ],
    systemPrompt: `You are a strategic lead qualification specialist focused on identifying high-intent buyers and booking meetings.

## Core Behaviors
- **Qualify**: Determine fit through strategic questioning
- **Score**: Mentally rate leads based on responses
- **Route**: Guide qualified leads to booking, others to resources
- **Book**: Secure meeting commitments with decision-makers

## BANT Qualification Framework
- **Budget**: Do they have purchasing authority?
- **Authority**: Are they a decision-maker?
- **Need**: Do they have a clear problem we solve?
- **Timeline**: Are they actively looking to buy?

## Conversation Flow
1. Warm greeting and open-ended question
2. Understand their current situation
3. Identify pain points and goals
4. Qualify budget and timeline
5. Either book meeting or provide resources

## Lead Scoring (Internal)
- Hot (book immediately): Clear need, budget, timeline < 3 months
- Warm (nurture): Need exists, exploring options
- Cold (resource only): Just researching, no timeline

## Booking Triggers
- Mentions specific problem we solve
- Asks about pricing or implementation
- References competitor comparisons
- Has clear decision timeline

## Key Phrases
- "What's driving the need for this now?"
- "Who else would be involved in this decision?"
- "If we could solve X, when would you want to start?"
- "I'd love to show you exactly how we handle that. When works for a quick call?"

Qualify efficiently but never rush. Bad-fit leads waste everyone's time.`,
  },
];

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconColor?: string;
  iconColors?: string[];
  category:
    | "communication"
    | "crm"
    | "productivity"
    | "automation"
    | "ecommerce";
  authType: "oauth" | "apiKey" | "urlParam";
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  apiKeyHelpUrl?: string;
  urlParamKey?: string;
  urlParamLabel?: string;
  urlParamPlaceholder?: string;
}

export const INTEGRATIONS: Integration[] = [
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Sync contacts and manage CRM",
    icon: "hubspot",
    iconColor: "#FF7A59",
    category: "crm",
    authType: "oauth",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect to 8,000+ apps",
    icon: "zapier",
    iconColor: "#FF4A00",
    category: "automation",
    authType: "apiKey",
    apiKeyLabel: "Zapier MCP API Key",
    apiKeyPlaceholder: "sk_live_...",
    apiKeyHelpUrl: "https://actions.zapier.com/settings/mcp",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage issues and projects",
    icon: "linear",
    iconColor: "#5E6AD2",
    category: "productivity",
    authType: "apiKey",
    apiKeyLabel: "Linear API Key",
    apiKeyPlaceholder: "lin_api_...",
    apiKeyHelpUrl: "https://linear.app/settings/api",
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Access your store catalog",
    icon: "shopify",
    iconColor: "#96BF48",
    category: "ecommerce",
    authType: "urlParam",
    urlParamKey: "store-domain",
    urlParamLabel: "Shopify Store Domain",
    urlParamPlaceholder: "your-store.myshopify.com",
  },
];

export interface PricingPlan {
  id: "PRO" | "TEAM" | "BUSINESS";
  name: string;
  price: number;
  currency: string;
  period: string;
  usageNote: string;
  popular: boolean;
  popularBadge?: string;
  privateBadge?: string;
  features: string[];
  ctaLabel: string;
  ctaVariant: "default" | "outline";
  checkoutUrl: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "PRO",
    name: "Pro",
    price: 29,
    currency: "USD",
    period: "month",
    usageNote: "+ usage over $10",
    popular: false,
    features: [
      "Unlimited Agents & Knowledge",
      "Best AI Models",
      "Deploy to WhatsApp, Slack, more",
      "1 Custom Domain",
      "Community Support",
    ],
    ctaLabel: "Start Pro",
    ctaVariant: "outline",
    checkoutUrl: "/plans?autoCheckout=PRO&period=MONTHLY",
  },
  {
    id: "TEAM",
    name: "Team",
    price: 99,
    currency: "USD",
    period: "month",
    usageNote: "+ usage over $30",
    popular: true,
    popularBadge: "Most Popular",
    features: [
      "Everything in Pro, plus:",
      "Unlimited Team Members",
      "Unlimited AI HQs",
      "5 Custom Domains",
      "Email Support",
    ],
    ctaLabel: "Start Team",
    ctaVariant: "default",
    checkoutUrl: "/plans?autoCheckout=TEAM&period=MONTHLY",
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: 299,
    currency: "USD",
    period: "month",
    usageNote: "+ usage over $100",
    popular: false,
    privateBadge: "Most Private",
    features: [
      "Everything in Team, plus:",
      "Zero Data Retention (ZDR)",
      "Unlimited Custom Domains",
      "HIPAA Compatible",
      "24/7 Priority Support",
    ],
    ctaLabel: "Start Business",
    ctaVariant: "outline",
    checkoutUrl: "/plans?autoCheckout=BUSINESS&period=MONTHLY",
  },
];

// Navigation helpers
export function getNextStep(
  currentStep: OnboardingStep
): OnboardingStep | null {
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex === ONBOARDING_STEPS.length - 1) {
    return null;
  }
  return ONBOARDING_STEPS[currentIndex + 1];
}

export function getPreviousStep(
  currentStep: OnboardingStep
): OnboardingStep | null {
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
  if (currentIndex <= 0) {
    return null;
  }
  return ONBOARDING_STEPS[currentIndex - 1];
}

export function getNextTrainSubStep(
  currentSubStep: TrainSubStep
): TrainSubStep | null {
  const currentIndex = TRAIN_SUB_STEPS.indexOf(currentSubStep);
  if (currentIndex === -1 || currentIndex === TRAIN_SUB_STEPS.length - 1) {
    return null;
  }
  return TRAIN_SUB_STEPS[currentIndex + 1];
}

export function getPreviousTrainSubStep(
  currentSubStep: TrainSubStep
): TrainSubStep | null {
  const currentIndex = TRAIN_SUB_STEPS.indexOf(currentSubStep);
  if (currentIndex <= 0) {
    return null;
  }
  return TRAIN_SUB_STEPS[currentIndex - 1];
}

export function getStepProgress(currentStep: OnboardingStep): {
  current: number;
  total: number;
  percentage: number;
} {
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
  return {
    current: currentIndex + 1,
    total: ONBOARDING_STEPS.length,
    percentage: ((currentIndex + 1) / ONBOARDING_STEPS.length) * 100,
  };
}

export function getTrainSubStepProgress(currentSubStep: TrainSubStep): {
  current: number;
  total: number;
} {
  const currentIndex = TRAIN_SUB_STEPS.indexOf(currentSubStep);
  return {
    current: currentIndex + 1,
    total: TRAIN_SUB_STEPS.length,
  };
}

// Share URL helpers
export function computeShareUrl(
  appName: string | null,
  appId: string | null
): string {
  if (!appName || !appId) return "";

  // Create slug (same as getShortenedAppIdentifier)
  const nameWithoutSpacesOrPunctuation = appName.replace(/[\s\W_]+/g, "");
  const slug = `${nameWithoutSpacesOrPunctuation}-${appId}`.toLowerCase();

  // Apps are accessed via vanity subdomain
  return `https://${slug}.chipp.ai/#/chat`;
}

export function computeEmbedCode(
  applicationUrl: string,
  appId: string | null
): string {
  if (!appId || !applicationUrl) return "";

  return `<!-- Chipp Chat Widget -->
<script>
  window.CHIPP_APP_URL = "${applicationUrl}";
  window.CHIPP_APP_ID = ${appId};
</script>

<link rel="stylesheet" href="https://storage.googleapis.com/chipp-chat-widget-assets/build/bundle.css" />

<script defer src="https://storage.googleapis.com/chipp-chat-widget-assets/build/bundle.js"></script>`;
}
