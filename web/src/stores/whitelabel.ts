/**
 * Whitelabel Store
 *
 * Manages whitelabel configuration including custom branding.
 */

import { writable, derived } from "svelte/store";

// ========================================
// Runtime Config (for whitelabel detection)
// ========================================

export interface WhitelabelConfig {
  isWhitelabeled: boolean;
  companyName: string | null;
  companyLogoUrl: string | null;
  companyColor: string | null;
  customDomain: string | null;
}

const defaultConfig: WhitelabelConfig = {
  isWhitelabeled: false,
  companyName: null,
  companyLogoUrl: null,
  companyColor: null,
  customDomain: null,
};

export const whitelabelConfig = writable<WhitelabelConfig>(defaultConfig);
export const isWhitelabeled = derived(
  whitelabelConfig,
  ($config) => $config.isWhitelabeled
);
export const companyName = derived(
  whitelabelConfig,
  ($config) => $config.companyName
);
export const companyLogoUrl = derived(
  whitelabelConfig,
  ($config) => $config.companyLogoUrl
);
export const companyColor = derived(
  whitelabelConfig,
  ($config) => $config.companyColor
);

/**
 * Apply tenant branding to the page (CSS variables, favicon, title).
 * Called both from Worker-injected config and API-fetched config.
 */
function applyTenantBranding(config: {
  primaryColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  companyName?: string | null;
}): void {
  const root = document.documentElement.style;

  if (config.primaryColor) {
    root.setProperty("--brand-color", config.primaryColor);
  }

  if (config.faviconUrl) {
    const link =
      document.querySelector<HTMLLinkElement>('link[rel="icon"]') ||
      document.createElement("link");
    link.rel = "icon";
    link.href = config.faviconUrl;
    if (!link.parentElement) {
      document.head.appendChild(link);
    }
  }

  if (config.companyName) {
    document.title = config.companyName;
  }
}

/**
 * Initialize whitelabel settings.
 * Checks window.__TENANT_CONFIG__ first (injected by Worker at the edge),
 * falls back to API call for custom domains.
 */
export async function initWhitelabel(): Promise<void> {
  // Check for Worker-injected tenant config (instant, no network call)
  const injected = (window as unknown as Record<string, unknown>).__TENANT_CONFIG__ as {
    companyName?: string;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    slug?: string;
    features?: Record<string, boolean>;
  } | undefined;

  if (injected) {
    whitelabelConfig.set({
      isWhitelabeled: true,
      companyName: injected.companyName || null,
      companyLogoUrl: injected.logoUrl || null,
      companyColor: injected.primaryColor || null,
      customDomain: window.location.hostname,
    });
    applyTenantBranding(injected);
    return;
  }

  // Check if we're on a custom domain or whitelabel subdomain
  const hostname = window.location.hostname;

  // Skip whitelabel check for localhost or main domain
  if (hostname === "localhost" || hostname.endsWith("chipp.ai")) {
    return;
  }

  // Fetch from API (custom domain without Worker injection, or direct hit)
  try {
    const response = await fetch("/api/whitelabel/config", {
      credentials: "include",
    });

    if (response.ok) {
      const config = await response.json();
      whitelabelConfig.set({
        isWhitelabeled: true,
        companyName: config.companyName || null,
        companyLogoUrl: config.logoUrl || null,
        companyColor: config.primaryColor || null,
        customDomain: hostname,
      });
      applyTenantBranding(config);
    }
  } catch (error) {
    console.warn("[whitelabel] Failed to load config:", error);
  }
}

/**
 * Reset whitelabel configuration to default
 */
export function resetWhitelabel(): void {
  whitelabelConfig.set(defaultConfig);
}

// ========================================
// Settings Management (for Enterprise admins)
// ========================================

export interface WhitelabelFeatures {
  isGoogleAuthDisabled?: boolean;
  isMicrosoftAuthDisabled?: boolean;
  isLocalAuthDisabled?: boolean;
  isBillingDisabled?: boolean;
  isHelpCenterDisabled?: boolean;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
}

export interface WhitelabelTenant {
  id: string;
  slug: string;
  name: string;
  customDomain: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  features: WhitelabelFeatures;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhitelabelSettingsState {
  tenant: WhitelabelTenant | null;
  organization: {
    id: string;
    name: string;
    subscriptionTier: string;
  } | null;
  isLoading: boolean;
  error: string | null;
}

const defaultSettingsState: WhitelabelSettingsState = {
  tenant: null,
  organization: null,
  isLoading: false,
  error: null,
};

export const whitelabelSettingsStore =
  writable<WhitelabelSettingsState>(defaultSettingsState);

export const whitelabelTenant = derived(
  whitelabelSettingsStore,
  ($store) => $store.tenant
);
export const whitelabelOrganization = derived(
  whitelabelSettingsStore,
  ($store) => $store.organization
);
export const isWhitelabelLoading = derived(
  whitelabelSettingsStore,
  ($store) => $store.isLoading
);
export const whitelabelError = derived(
  whitelabelSettingsStore,
  ($store) => $store.error
);

/**
 * Fetch whitelabel settings from API (for Enterprise users)
 */
export async function fetchWhitelabelSettings(): Promise<void> {
  whitelabelSettingsStore.update((state) => ({
    ...state,
    isLoading: true,
    error: null,
  }));

  try {
    const response = await fetch("/api/organization/whitelabel", {
      credentials: "include",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to fetch whitelabel settings");
    }

    const { data } = await response.json();

    whitelabelSettingsStore.update((state) => ({
      ...state,
      tenant: data.tenant,
      organization: data.organization,
      isLoading: false,
    }));
  } catch (error) {
    whitelabelSettingsStore.update((state) => ({
      ...state,
      isLoading: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
  }
}

export interface UpdateWhitelabelParams {
  name?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  isGoogleAuthDisabled?: boolean;
  isMicrosoftAuthDisabled?: boolean;
  isLocalAuthDisabled?: boolean;
  isBillingDisabled?: boolean;
  isHelpCenterDisabled?: boolean;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
}

/**
 * Update whitelabel settings
 */
export async function updateWhitelabelSettings(
  params: UpdateWhitelabelParams
): Promise<WhitelabelTenant> {
  const response = await fetch("/api/organization/whitelabel", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to update whitelabel settings");
  }

  const { data } = await response.json();

  whitelabelSettingsStore.update((state) => ({
    ...state,
    tenant: data,
  }));

  return data;
}
