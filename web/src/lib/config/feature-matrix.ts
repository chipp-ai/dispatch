/**
 * Feature Matrix Configuration
 *
 * Static mapping of features to subscription tiers for the DevPanel.
 * Helps developers understand tier-gated functionality.
 */

export type SubscriptionTier = "FREE" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE";

export interface FeatureDefinition {
  name: string;
  description?: string;
  tiers: Record<SubscriptionTier, boolean | string>;
}

/**
 * Feature matrix based on canonical pricing page (chipp-admin/app/plans/Plans.tsx)
 * Last synced: 2026-02-04
 */
export const featureMatrix: FeatureDefinition[] = [
  {
    name: "Knowledge Sources",
    description: "Documents, webpages, YouTube videos that inform your agent",
    tiers: { FREE: "Limited", PRO: "Unlimited", TEAM: "Unlimited", BUSINESS: "Unlimited", ENTERPRISE: "Unlimited" }
  },
  {
    name: "Team Members",
    description: "Editors who can create and modify agents",
    tiers: { FREE: "1", PRO: "1", TEAM: "Unlimited", BUSINESS: "Unlimited", ENTERPRISE: "Unlimited" }
  },
  {
    name: "Voice Agents",
    description: "AI agents with voice capabilities",
    tiers: { FREE: false, PRO: true, TEAM: true, BUSINESS: true, ENTERPRISE: true }
  },
  {
    name: "Voice Cloning",
    description: "Clone voices for personalized agents",
    tiers: { FREE: false, PRO: false, TEAM: true, BUSINESS: true, ENTERPRISE: true }
  },
  {
    name: "AI HQs (Agent Bundles)",
    description: "Group and sell multiple agents together",
    tiers: { FREE: false, PRO: false, TEAM: "Unlimited", BUSINESS: "Unlimited", ENTERPRISE: "Unlimited" }
  },
  {
    name: "API Access",
    description: "Programmatic access to your agents",
    tiers: { FREE: false, PRO: true, TEAM: true, BUSINESS: true, ENTERPRISE: true }
  },
  {
    name: "Custom Actions",
    description: "Connect agents to external APIs and services",
    tiers: { FREE: false, PRO: true, TEAM: true, BUSINESS: true, ENTERPRISE: true }
  },
  {
    name: "HIPAA Compliance",
    description: "Healthcare-ready with Zero Data Retention",
    tiers: { FREE: false, PRO: false, TEAM: false, BUSINESS: true, ENTERPRISE: true }
  },
  {
    name: "Custom Domain",
    description: "Use your own domain (e.g., ai.yourdomain.com)",
    tiers: { FREE: false, PRO: false, TEAM: false, BUSINESS: true, ENTERPRISE: true }
  },
  {
    name: "Whitelabel Branding",
    description: "Remove all Chipp branding, use your own",
    tiers: { FREE: false, PRO: false, TEAM: false, BUSINESS: false, ENTERPRISE: true }
  },
];

export const tierOrder: SubscriptionTier[] = ["FREE", "PRO", "TEAM", "BUSINESS", "ENTERPRISE"];

/** Abbreviated tier names for compact display */
export const tierAbbreviations: Record<SubscriptionTier, string> = {
  FREE: "F",
  PRO: "P",
  TEAM: "T",
  BUSINESS: "B",
  ENTERPRISE: "E"
};
