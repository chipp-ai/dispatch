/**
 * Notification Type Registry
 *
 * Defines all notification types, their metadata, and recipient filters.
 * Used by the notification service and preferences UI.
 */

export type NotificationType =
  | "new_chat"
  | "consumer_signup"
  | "app_engagement"
  | "credit_purchase"
  | "workspace_member_joined"
  | "credit_low"
  | "credit_exhausted"
  | "payment_failed"
  | "subscription_changed";

export type NotificationCategory = "engagement" | "billing" | "team";

export type RecipientFilter =
  | "org_admins"
  | "workspace_admins"
  | "app_owner"
  | "specific_user";

export interface NotificationTypeInfo {
  label: string;
  description: string;
  category: NotificationCategory;
  defaultRecipients: RecipientFilter;
  cooldownMinutes?: number;
}

export const NOTIFICATION_REGISTRY: Record<NotificationType, NotificationTypeInfo> = {
  new_chat: {
    label: "New Chat Session",
    description: "When a consumer starts a new conversation on one of your apps",
    category: "engagement",
    defaultRecipients: "org_admins",
  },
  consumer_signup: {
    label: "New Consumer Signup",
    description: "When someone signs up to use one of your apps",
    category: "engagement",
    defaultRecipients: "org_admins",
  },
  app_engagement: {
    label: "App Engagement Digest",
    description: "Periodic summary of app usage and engagement",
    category: "engagement",
    defaultRecipients: "org_admins",
  },
  credit_purchase: {
    label: "Credit Purchase",
    description: "When a consumer purchases credits on your app",
    category: "billing",
    defaultRecipients: "org_admins",
  },
  workspace_member_joined: {
    label: "Workspace Member Joined",
    description: "When someone joins your workspace",
    category: "team",
    defaultRecipients: "workspace_admins",
  },
  credit_low: {
    label: "Low Credit Balance",
    description: "When your organization's credit balance is running low",
    category: "billing",
    defaultRecipients: "org_admins",
    cooldownMinutes: 1440, // 24 hours
  },
  credit_exhausted: {
    label: "Credits Exhausted",
    description: "When your organization's credits are completely used up",
    category: "billing",
    defaultRecipients: "org_admins",
    cooldownMinutes: 1440,
  },
  payment_failed: {
    label: "Payment Failed",
    description: "When a subscription payment fails",
    category: "billing",
    defaultRecipients: "org_admins",
  },
  subscription_changed: {
    label: "Subscription Changed",
    description: "When your subscription is upgraded, downgraded, or canceled",
    category: "billing",
    defaultRecipients: "org_admins",
  },
};

export const NOTIFICATION_CATEGORIES: Record<NotificationCategory, string> = {
  engagement: "Engagement",
  billing: "Billing",
  team: "Team",
};
