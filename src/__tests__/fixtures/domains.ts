/**
 * Domain Fixtures
 *
 * Pre-defined custom domain fixtures for testing domain registration,
 * SSL provisioning, and whitelabel features.
 *
 * FIXTURE TYPES:
 * 1. Registered domains (verified, SSL active)
 * 2. Pending domains (awaiting verification)
 * 3. Failed domains (SSL provisioning failed)
 * 4. Whitelabel domains with branding
 *
 * USAGE:
 *   import { createVerifiedDomain, createPendingDomain } from "../fixtures/domains.ts";
 *
 *   const org = await createProOrg();
 *   const domain = await createVerifiedDomain(org, "app.example.com");
 *   const pending = await createPendingDomain(org, "new.example.com");
 */

import type { TestOrganization } from "./organizations.ts";
import type { TestApplication } from "../setup.ts";
import { sql } from "../setup.ts";
import { generateId } from "../../utils/id.ts";

// ========================================
// Types
// ========================================

// Match the actual schema types from db/schema.ts
export type DomainType = "chat" | "dashboard" | "api";
export type DomainStatus = "pending" | "active" | "failed" | "expired";

export interface TestDomain {
  id: string;
  hostname: string;
  type: DomainType;
  status: DomainStatus;
  organizationId: string; // UUID
  applicationId?: string;
  tenantId?: string;
  cloudflareId?: string;
  sslStatus: "pending" | "active" | "failed" | "expired";
  dcvToken?: string;
  verifiedAt?: Date;
  createdAt: Date;
}

export interface TestDomainWithBranding extends TestDomain {
  branding: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string;
    faviconUrl?: string;
    companyName?: string;
  };
}

export interface DnsRecord {
  type: "CNAME" | "A" | "TXT";
  name: string;
  value: string;
  ttl: number;
}

// ========================================
// Core Database Operations
// ========================================

/**
 * Create a domain directly in the database.
 * Falls back to mock data if database schema doesn't support domains.
 */
async function createDomainInDb(options: {
  hostname: string;
  type: DomainType;
  organizationId: string; // UUID
  appId?: string;
  tenantId?: string;
  sslStatus?: "pending" | "active" | "failed" | "expired";
  cloudflareId?: string;
  dcvToken?: string;
  brandStyles?: Record<string, unknown>;
}): Promise<TestDomain> {
  const domainId = generateId();
  const sslStatus = options.sslStatus ?? "pending";
  const cloudflareId = options.cloudflareId ?? `cf_${generateRandomId(24)}`;
  const dcvToken = options.dcvToken ?? `dcv_${generateRandomId(32)}`;

  try {
    // Try with brand_styles column first
    await sql`
      INSERT INTO app.custom_domains (
        id,
        hostname,
        type,
        organization_id,
        app_id,
        tenant_id,
        cloudflare_id,
        ssl_status,
        dcv_token,
        brand_styles,
        created_at,
        updated_at
      )
      VALUES (
        ${domainId},
        ${options.hostname},
        ${options.type},
        ${options.organizationId},
        ${options.appId ?? null},
        ${options.tenantId ?? null},
        ${cloudflareId},
        ${sslStatus},
        ${dcvToken},
        ${options.brandStyles ? JSON.stringify(options.brandStyles) : null}::jsonb,
        NOW(),
        NOW()
      )
    `;
  } catch (err) {
    // If brand_styles column doesn't exist, try without it
    if (err instanceof Error && err.message.includes("brand_styles")) {
      try {
        await sql`
          INSERT INTO app.custom_domains (
            id,
            hostname,
            type,
            organization_id,
            app_id,
            tenant_id,
            cloudflare_id,
            ssl_status,
            dcv_token,
            created_at,
            updated_at
          )
          VALUES (
            ${domainId},
            ${options.hostname},
            ${options.type},
            ${options.organizationId},
            ${options.appId ?? null},
            ${options.tenantId ?? null},
            ${cloudflareId},
            ${sslStatus},
            ${dcvToken},
            NOW(),
            NOW()
          )
        `;
      } catch (innerErr) {
        // If custom_domains table doesn't exist, return mock data
        console.log(
          `[test] custom_domains table not available, using mock data`
        );
      }
    } else if (
      err instanceof Error &&
      (err.message.includes("custom_domains") ||
        err.message.includes("relation"))
    ) {
      // Table doesn't exist, return mock data
      console.log(`[test] custom_domains table not available, using mock data`);
    } else {
      throw err;
    }
  }

  return {
    id: domainId,
    hostname: options.hostname,
    type: options.type,
    status: sslStatus === "active" ? "active" : sslStatus,
    organizationId: options.organizationId,
    applicationId: options.appId,
    tenantId: options.tenantId,
    cloudflareId,
    sslStatus,
    dcvToken,
    createdAt: new Date(),
  };
}

// ========================================
// Verified Domains
// ========================================

/**
 * Create a fully verified domain with active SSL.
 * This represents a domain ready for production use.
 */
export async function createVerifiedDomain(
  org: TestOrganization,
  hostname: string,
  type: DomainType = "chat"
): Promise<TestDomain> {
  const domain = await createDomainInDb({
    hostname,
    type,
    organizationId: org.id,
    sslStatus: "active",
  });

  return {
    ...domain,
    verifiedAt: new Date(),
  };
}

/**
 * Create a verified domain linked to a specific application.
 */
export async function createAppDomain(
  org: TestOrganization,
  app: TestApplication,
  hostname: string
): Promise<TestDomain> {
  const domain = await createDomainInDb({
    hostname,
    type: "chat",
    organizationId: org.id,
    appId: app.id,
    sslStatus: "active",
  });

  return {
    ...domain,
    verifiedAt: new Date(),
  };
}

/**
 * Create a verified HQ (workspace landing page) domain.
 */
export async function createHqDomain(
  org: TestOrganization,
  hostname: string
): Promise<TestDomain> {
  return createVerifiedDomain(org, hostname, "dashboard");
}

// ========================================
// Pending Domains
// ========================================

/**
 * Create a domain that's awaiting DNS verification.
 */
export async function createPendingDomain(
  org: TestOrganization,
  hostname: string
): Promise<TestDomain> {
  return createDomainInDb({
    hostname,
    type: "chat",
    organizationId: org.id,
    sslStatus: "pending",
  });
}

/**
 * Create a domain with SSL provisioning in progress.
 */
export async function createSslPendingDomain(
  org: TestOrganization,
  hostname: string
): Promise<TestDomain> {
  // Same as pending - SSL is part of the verification process
  return createDomainInDb({
    hostname,
    type: "chat",
    organizationId: org.id,
    sslStatus: "pending",
  });
}

// ========================================
// Failed Domains
// ========================================

/**
 * Create a domain where SSL provisioning failed.
 */
export async function createFailedDomain(
  org: TestOrganization,
  hostname: string,
  _failureReason: string = "SSL certificate provisioning failed"
): Promise<TestDomain> {
  return createDomainInDb({
    hostname,
    type: "chat",
    organizationId: org.id,
    sslStatus: "failed",
  });
}

/**
 * Create an expired domain (SSL certificate expired).
 */
export async function createExpiredDomain(
  org: TestOrganization,
  hostname: string
): Promise<TestDomain> {
  return createDomainInDb({
    hostname,
    type: "chat",
    organizationId: org.id,
    sslStatus: "expired",
  });
}

// ========================================
// Whitelabel Domains
// ========================================

/**
 * Create a domain with full whitelabel branding configured.
 */
export async function createWhitelabelDomain(
  org: TestOrganization,
  hostname: string,
  branding: {
    primaryColor?: string;
    secondaryColor?: string;
    logoUrl?: string;
    faviconUrl?: string;
    companyName?: string;
  }
): Promise<TestDomainWithBranding> {
  const brandStyles = {
    primaryColor: branding.primaryColor ?? "#2563eb",
    logoUrl: branding.logoUrl,
    faviconUrl: branding.faviconUrl,
    companyName: branding.companyName,
  };

  const domain = await createDomainInDb({
    hostname,
    type: "dashboard",
    organizationId: org.id,
    sslStatus: "active",
    brandStyles,
  });

  return {
    ...domain,
    verifiedAt: new Date(),
    branding: {
      primaryColor: branding.primaryColor ?? "#2563eb",
      secondaryColor: branding.secondaryColor ?? "#1d4ed8",
      logoUrl: branding.logoUrl,
      faviconUrl: branding.faviconUrl,
      companyName: branding.companyName,
    },
  };
}

/**
 * Create a whitelabel domain with dark mode theme.
 */
export async function createDarkModeWhitelabelDomain(
  org: TestOrganization,
  hostname: string
): Promise<TestDomainWithBranding> {
  return createWhitelabelDomain(org, hostname, {
    primaryColor: "#1a1a2e",
    secondaryColor: "#16213e",
    companyName: "Dark Mode Inc",
  });
}

/**
 * Create a whitelabel domain with custom logo.
 */
export async function createBrandedWhitelabelDomain(
  org: TestOrganization,
  hostname: string,
  companyName: string
): Promise<TestDomainWithBranding> {
  return createWhitelabelDomain(org, hostname, {
    primaryColor: "#2563eb",
    secondaryColor: "#1d4ed8",
    logoUrl: `https://cdn.example.com/logos/${companyName.toLowerCase()}.png`,
    faviconUrl: `https://cdn.example.com/favicons/${companyName.toLowerCase()}.ico`,
    companyName,
  });
}

// ========================================
// DNS Verification Helpers
// ========================================

/**
 * Get expected DNS records for domain verification.
 */
export function getExpectedDnsRecords(hostname: string): DnsRecord[] {
  return [
    {
      type: "CNAME",
      name: hostname,
      value: "custom.chipp.ai",
      ttl: 3600,
    },
    {
      type: "CNAME",
      name: `_cf-custom-hostname.${hostname}`,
      value: `dcv_${generateRandomId(32)}.dcv.cloudflare.com`,
      ttl: 300,
    },
  ];
}

/**
 * Mock DNS lookup result (for testing verification flow).
 */
export function createMockDnsLookupResult(
  hostname: string,
  isValid: boolean
): { hostname: string; records: DnsRecord[]; verified: boolean } {
  return {
    hostname,
    records: isValid ? getExpectedDnsRecords(hostname) : [],
    verified: isValid,
  };
}

// ========================================
// SSL Certificate Mocks
// ========================================

/**
 * Create mock SSL certificate status.
 */
export function createMockSslStatus(
  status: "pending" | "active" | "failed" | "expired"
): {
  status: string;
  issuer?: string;
  validFrom?: Date;
  validTo?: Date;
  error?: string;
} {
  switch (status) {
    case "active":
      return {
        status: "active",
        issuer: "Let's Encrypt Authority X3",
        validFrom: new Date(),
        validTo: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      };
    case "pending":
      return { status: "pending" };
    case "failed":
      return {
        status: "failed",
        error: "DNS verification failed - CNAME record not found",
      };
    case "expired":
      return {
        status: "expired",
        issuer: "Let's Encrypt Authority X3",
        validFrom: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      };
  }
}

// ========================================
// Cleanup
// ========================================

/**
 * Delete all test domains for an organization.
 */
export async function cleanupOrgDomains(orgId: string): Promise<void> {
  await sql`
    DELETE FROM app.custom_domains
    WHERE organization_id = ${orgId}::uuid
  `;
}

/**
 * Delete all test domains by hostname pattern.
 */
export async function cleanupAllTestDomains(): Promise<void> {
  // Delete domains with test-like hostnames
  await sql`
    DELETE FROM app.custom_domains
    WHERE hostname LIKE 'test.%'
    OR hostname LIKE '%.test.%'
    OR hostname LIKE 'test-%'
  `;
}

/**
 * Delete a specific domain by ID.
 */
export async function cleanupDomain(domainId: string): Promise<void> {
  await sql`
    DELETE FROM app.custom_domains
    WHERE id = ${domainId}
  `;
}

// ========================================
// Helpers
// ========================================

function generateRandomId(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
