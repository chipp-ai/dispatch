/**
 * Model Configuration for Chipp Deno App Builder
 * Adapted from chipp-admin modelConfig.tsx
 */

export type Badge =
  | "Speedy"
  | "Reasoning"
  | "Long Context"
  | "Cost Effective"
  | "Best Quality"
  | "Vision";

export type ModelProvider = "openai" | "anthropic" | "google" | "other";

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  learnMoreLink: string;
  provider: ModelProvider;
  order: number;
  badges: Badge[];
  tokenLimit: string;
  tokenLimitDescription: string;
  pricing: {
    prompt: number; // per million tokens
    completion: number; // per million tokens
  };
  useCases: string[];
  featured?: boolean;
}

export const badgeColors: Record<Badge, string> = {
  Speedy: "bg-orange-100 text-orange-800",
  Reasoning: "bg-purple-100 text-purple-800",
  "Long Context": "bg-blue-100 text-blue-800",
  "Cost Effective": "bg-green-100 text-green-800",
  "Best Quality": "bg-yellow-100 text-yellow-800",
  Vision: "bg-pink-100 text-pink-800",
};

export const providerLogos: Record<ModelProvider, string> = {
  openai: "/assets/openai-logo.svg",
  anthropic: "/assets/anthropic-logo.svg",
  google: "/assets/google-logo.svg",
  other: "/assets/default-model-logo.svg",
};

/**
 * Default model for new applications.
 * Change this single value to update the default across the frontend.
 * Backend equivalent: src/config/models.ts
 */
export const DEFAULT_MODEL_ID = "claude-sonnet-4-5";

export const MODELS: ModelConfig[] = [
  // OpenAI Models
  {
    id: "gpt-5",
    name: "GPT-5",
    description:
      "OpenAI's most advanced model with exceptional reasoning and capabilities",
    learnMoreLink: "https://openai.com/gpt-5",
    provider: "openai",
    order: 1,
    badges: ["Best Quality", "Reasoning"],
    tokenLimit: "128K",
    tokenLimitDescription: "Supports up to 128,000 tokens context",
    pricing: { prompt: 10.0, completion: 30.0 },
    useCases: [
      "Complex multi-step reasoning",
      "Advanced code generation",
      "Research and analysis",
      "Creative writing",
      "Mathematical problem solving",
    ],
    featured: true,
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    description:
      "Smaller, faster version of GPT-5 with excellent cost-performance ratio",
    learnMoreLink: "https://openai.com/gpt-5",
    provider: "openai",
    order: 2,
    badges: ["Speedy", "Cost Effective"],
    tokenLimit: "128K",
    tokenLimitDescription: "Supports up to 128,000 tokens context",
    pricing: { prompt: 1.5, completion: 6.0 },
    useCases: [
      "Quick responses",
      "Simple Q&A",
      "Basic coding tasks",
      "Content summarization",
      "Data extraction",
    ],
    featured: true,
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    description:
      "Latest GPT-4 series model with improved coding and instruction following",
    learnMoreLink: "https://openai.com/gpt-4",
    provider: "openai",
    order: 3,
    badges: ["Best Quality", "Long Context"],
    tokenLimit: "1M",
    tokenLimitDescription: "Supports up to 1 million tokens context",
    pricing: { prompt: 2.0, completion: 8.0 },
    useCases: [
      "Software development",
      "Technical documentation",
      "Complex analysis",
      "Long document processing",
    ],
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    description: "Smaller, faster version of GPT-4.1 optimized for efficiency",
    learnMoreLink: "https://openai.com/gpt-4",
    provider: "openai",
    order: 4,
    badges: ["Speedy", "Cost Effective"],
    tokenLimit: "1M",
    tokenLimitDescription: "Supports up to 1 million tokens context",
    pricing: { prompt: 0.4, completion: 1.6 },
    useCases: [
      "High-volume tasks",
      "Quick summaries",
      "Simple coding",
      "Chat applications",
    ],
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "OpenAI's omni model with vision and audio capabilities",
    learnMoreLink: "https://openai.com/gpt-4o",
    provider: "openai",
    order: 5,
    badges: ["Vision", "Best Quality"],
    tokenLimit: "128K",
    tokenLimitDescription: "Supports up to 128,000 tokens context",
    pricing: { prompt: 2.5, completion: 10.0 },
    useCases: [
      "Image analysis",
      "Document processing",
      "Visual Q&A",
      "Creative content",
    ],
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Smaller version of GPT-4o, fast and affordable",
    learnMoreLink: "https://openai.com/gpt-4o",
    provider: "openai",
    order: 6,
    badges: ["Vision", "Cost Effective", "Speedy"],
    tokenLimit: "128K",
    tokenLimitDescription: "Supports up to 128,000 tokens context",
    pricing: { prompt: 0.15, completion: 0.6 },
    useCases: [
      "Quick image descriptions",
      "Simple visual tasks",
      "High-volume processing",
    ],
  },
  {
    id: "o1",
    name: "o1",
    description: "OpenAI's reasoning model with chain-of-thought capabilities",
    learnMoreLink: "https://openai.com/o1",
    provider: "openai",
    order: 7,
    badges: ["Reasoning", "Best Quality"],
    tokenLimit: "200K",
    tokenLimitDescription: "Supports up to 200,000 tokens context",
    pricing: { prompt: 15.0, completion: 60.0 },
    useCases: [
      "Complex reasoning",
      "Math problems",
      "Scientific analysis",
      "Strategic planning",
    ],
  },
  {
    id: "o3-mini",
    name: "o3 Mini",
    description: "Efficient reasoning model for complex tasks",
    learnMoreLink: "https://openai.com/o3",
    provider: "openai",
    order: 8,
    badges: ["Reasoning", "Cost Effective"],
    tokenLimit: "200K",
    tokenLimitDescription: "Supports up to 200,000 tokens context",
    pricing: { prompt: 1.1, completion: 4.4 },
    useCases: ["Logical reasoning", "Problem solving", "Code review"],
  },

  // Anthropic Models
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    description:
      "Enhanced Claude Sonnet with improved reasoning and coding capabilities",
    learnMoreLink:
      "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    provider: "anthropic",
    order: 8,
    badges: ["Best Quality", "Reasoning"],
    tokenLimit: "200K",
    tokenLimitDescription: "Supports up to 200,000 tokens context",
    pricing: { prompt: 3.0, completion: 15.0 },
    useCases: [
      "Complex analysis",
      "Code generation",
      "Research assistance",
      "Content creation",
      "Technical writing",
    ],
    featured: true,
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    description:
      "Balanced Claude model offering strong performance at lower cost",
    learnMoreLink: "https://anthropic.com/claude",
    provider: "anthropic",
    order: 9,
    badges: ["Reasoning", "Cost Effective"],
    tokenLimit: "200K",
    tokenLimitDescription: "Supports up to 200,000 tokens context",
    pricing: { prompt: 3.0, completion: 15.0 },
    useCases: [
      "Complex analysis",
      "Code generation",
      "Research assistance",
      "Content creation",
      "Technical writing",
    ],
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    description: "Fast and efficient model for everyday tasks",
    learnMoreLink: "https://anthropic.com/claude",
    provider: "anthropic",
    order: 10,
    badges: ["Speedy", "Cost Effective"],
    tokenLimit: "200K",
    tokenLimitDescription: "Supports up to 200,000 tokens context",
    pricing: { prompt: 0.8, completion: 4.0 },
    useCases: [
      "Quick responses",
      "Simple analysis",
      "Chat applications",
      "Basic coding",
    ],
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    description: "Anthropic's previous flagship with excellent quality",
    learnMoreLink: "https://anthropic.com/claude",
    provider: "anthropic",
    order: 11,
    badges: ["Best Quality"],
    tokenLimit: "200K",
    tokenLimitDescription: "Supports up to 200,000 tokens context",
    pricing: { prompt: 15.0, completion: 75.0 },
    useCases: ["Complex tasks", "High-stakes decisions", "Detailed analysis"],
  },

  // Google Models
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Google's most advanced model with reasoning and long context",
    learnMoreLink: "https://ai.google.dev/gemini-api",
    provider: "google",
    order: 12,
    badges: ["Reasoning", "Long Context", "Best Quality"],
    tokenLimit: "1M",
    tokenLimitDescription: "Supports up to 1 million tokens context",
    pricing: { prompt: 1.25, completion: 10.0 },
    useCases: [
      "Long document analysis",
      "Multi-modal tasks",
      "Research",
      "Complex reasoning",
      "Code generation",
    ],
    featured: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Fast and cost-effective with thinking capabilities",
    learnMoreLink: "https://ai.google.dev/gemini-api",
    provider: "google",
    order: 13,
    badges: ["Speedy", "Reasoning", "Cost Effective"],
    tokenLimit: "1M",
    tokenLimitDescription: "Supports up to 1 million tokens context",
    pricing: { prompt: 0.15, completion: 0.6 },
    useCases: ["Quick analysis", "High-volume tasks", "Real-time applications"],
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Previous generation flash model with solid performance",
    learnMoreLink: "https://ai.google.dev/gemini-api",
    provider: "google",
    order: 14,
    badges: ["Speedy", "Cost Effective"],
    tokenLimit: "1M",
    tokenLimitDescription: "Supports up to 1 million tokens context",
    pricing: { prompt: 0.1, completion: 0.4 },
    useCases: ["Budget-friendly tasks", "Simple chat", "Basic analysis"],
  },

  // Other Models
  {
    id: "deepseek-chat",
    name: "DeepSeek V3",
    description: "High-quality open model with excellent reasoning",
    learnMoreLink: "https://deepseek.com",
    provider: "other",
    order: 15,
    badges: ["Reasoning", "Cost Effective"],
    tokenLimit: "64K",
    tokenLimitDescription: "Supports up to 64,000 tokens context",
    pricing: { prompt: 0.27, completion: 1.1 },
    useCases: ["Code generation", "Analysis", "General assistance"],
  },
  {
    id: "llama-4-maverick",
    name: "Llama 4 Maverick",
    description: "Meta's latest open model with strong capabilities",
    learnMoreLink: "https://llama.meta.com",
    provider: "other",
    order: 16,
    badges: ["Cost Effective", "Long Context"],
    tokenLimit: "1M",
    tokenLimitDescription: "Supports up to 1 million tokens context",
    pricing: { prompt: 0.2, completion: 0.6 },
    useCases: ["General tasks", "Open source projects", "Research"],
  },
];

export const FEATURED_MODELS = MODELS.filter((m) => m.featured);

export function getBlendedPrice(pricing: {
  prompt: number;
  completion: number;
}): string {
  return `$${((pricing.prompt + pricing.completion) / 2).toFixed(2)}/M`;
}

export function getModelById(id: string): ModelConfig | undefined {
  return MODELS.find((m) => m.id === id);
}

export function getModelsByProvider(provider: ModelProvider): ModelConfig[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function sortModels(
  models: ModelConfig[],
  sortBy: "quality" | "price" | "speed" | "context" | "name"
): ModelConfig[] {
  const sorted = [...models];

  switch (sortBy) {
    case "quality":
      return sorted.sort((a, b) => a.order - b.order);
    case "price":
      return sorted.sort((a, b) => {
        const aPrice = (a.pricing.prompt + a.pricing.completion) / 2;
        const bPrice = (b.pricing.prompt + b.pricing.completion) / 2;
        return aPrice - bPrice;
      });
    case "speed":
      return sorted.sort((a, b) => {
        const aSpeed = a.badges.includes("Speedy") ? 0 : 1;
        const bSpeed = b.badges.includes("Speedy") ? 0 : 1;
        return aSpeed - bSpeed;
      });
    case "context":
      return sorted.sort((a, b) => {
        const parseContext = (limit: string) => {
          if (limit.includes("1M")) return 1000000;
          if (limit.includes("200K")) return 200000;
          if (limit.includes("128K")) return 128000;
          if (limit.includes("64K")) return 64000;
          return 0;
        };
        return parseContext(b.tokenLimit) - parseContext(a.tokenLimit);
      });
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return sorted;
  }
}
