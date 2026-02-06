/**
 * Sender Domain Verification Service
 *
 * Integrates with SMTP2GO REST API for programmatic domain verification.
 * Manages DNS records (DKIM, return-path, tracking, DMARC) for custom sender domains.
 */

import { sql } from "../../db/client.ts";
import * as Sentry from "@sentry/deno";

// ========================================
// Types
// ========================================

export interface SenderDomain {
  id: string;
  organizationId: string;
  domain: string;
  status: "pending" | "verified" | "failed";
  dkimRecordName: string | null;
  dkimRecordValue: string | null;
  returnPathRecordName: string | null;
  returnPathRecordValue: string | null;
  trackingRecordName: string | null;
  trackingRecordValue: string | null;
  dmarcRecordValue: string | null;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

interface Smtp2goAddResponse {
  data: {
    domain: string;
    dkim_selector?: string;
    dkim_record?: string;
    return_path_domain?: string;
    tracking_domain?: string;
    fulldomain?: string;
  };
  request_id: string;
}

interface Smtp2goVerifyResponse {
  data: {
    domain: string;
    dkim_verified?: boolean;
    return_path_verified?: boolean;
    tracking_verified?: boolean;
    fully_verified?: boolean;
  };
  request_id: string;
}

// ========================================
// Helpers
// ========================================

function getApiKey(): string | null {
  return Deno.env.get("SMTP2GO_API_KEY") || null;
}

async function smtp2goRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(`[sender-domain] SMTP2GO_API_KEY not configured, skipping ${endpoint}`);
    return null;
  }

  const response = await fetch(`https://api.smtp2go.com/v3/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, ...body }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SMTP2GO ${endpoint} failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

function mapRowToDomain(row: Record<string, unknown>): SenderDomain {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    domain: row.domain as string,
    status: row.status as "pending" | "verified" | "failed",
    dkimRecordName: row.dkim_record_name as string | null,
    dkimRecordValue: row.dkim_record_value as string | null,
    returnPathRecordName: row.return_path_record_name as string | null,
    returnPathRecordValue: row.return_path_record_value as string | null,
    trackingRecordName: row.tracking_record_name as string | null,
    trackingRecordValue: row.tracking_record_value as string | null,
    dmarcRecordValue: row.dmarc_record_value as string | null,
    verifiedAt: row.verified_at as string | null,
    lastCheckedAt: row.last_checked_at as string | null,
    createdAt: row.created_at as string,
  };
}

// ========================================
// Service
// ========================================

export const senderDomainService = {
  /**
   * Add a new sender domain for an organization.
   * Registers with SMTP2GO and returns DNS records to configure.
   */
  async addDomain(organizationId: string, domain: string): Promise<SenderDomain> {
    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      throw new Error("Invalid domain format");
    }

    // Check for duplicate
    const existing = await sql`
      SELECT id FROM app.sender_domains
      WHERE organization_id = ${organizationId} AND domain = ${domain}
      LIMIT 1
    `;
    if (existing.length > 0) {
      throw new Error("Domain already registered for this organization");
    }

    // Register with SMTP2GO (if key available)
    let dkimName: string | null = null;
    let dkimValue: string | null = null;
    let returnPathName: string | null = null;
    let returnPathValue: string | null = null;
    let trackingName: string | null = null;
    let trackingValue: string | null = null;
    let smtp2goDomainId: string | null = null;

    const apiResult = await smtp2goRequest<Smtp2goAddResponse>("domain/add", { domain });

    if (apiResult?.data) {
      const d = apiResult.data;
      smtp2goDomainId = d.fulldomain || domain;
      dkimName = d.dkim_selector ? `${d.dkim_selector}._domainkey.${domain}` : `em._domainkey.${domain}`;
      dkimValue = d.dkim_record || "dkim.smtp2go.net";
      returnPathName = d.return_path_domain || `return.${domain}`;
      returnPathValue = "return.smtp2go.net";
      trackingName = d.tracking_domain || `track.${domain}`;
      trackingValue = "track.smtp2go.net";
    } else {
      // Generate placeholder DNS records when SMTP2GO is not configured
      dkimName = `em._domainkey.${domain}`;
      dkimValue = "dkim.smtp2go.net";
      returnPathName = `return.${domain}`;
      returnPathValue = "return.smtp2go.net";
      trackingName = `track.${domain}`;
      trackingValue = "track.smtp2go.net";
    }

    const dmarcValue = `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`;

    // Insert into database
    const rows = await sql`
      INSERT INTO app.sender_domains (
        organization_id, domain, status, smtp2go_domain_id,
        dkim_record_name, dkim_record_value,
        return_path_record_name, return_path_record_value,
        tracking_record_name, tracking_record_value,
        dmarc_record_value
      ) VALUES (
        ${organizationId}, ${domain}, 'pending', ${smtp2goDomainId},
        ${dkimName}, ${dkimValue},
        ${returnPathName}, ${returnPathValue},
        ${trackingName}, ${trackingValue},
        ${dmarcValue}
      )
      RETURNING *
    `;

    return mapRowToDomain(rows[0] as Record<string, unknown>);
  },

  /**
   * Trigger a verification check for a pending domain.
   */
  async verifyDomain(domainId: string, organizationId: string): Promise<SenderDomain> {
    const rows = await sql`
      SELECT * FROM app.sender_domains
      WHERE id = ${domainId} AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      throw new Error("Domain not found");
    }

    const domainRecord = rows[0] as Record<string, unknown>;
    const domain = domainRecord.domain as string;

    // Call SMTP2GO verify
    let newStatus: "pending" | "verified" | "failed" = "pending";

    try {
      const result = await smtp2goRequest<Smtp2goVerifyResponse>("domain/verify", { domain });

      if (result?.data?.fully_verified) {
        newStatus = "verified";
      } else if (result?.data) {
        // Partial verification -- still pending
        newStatus = "pending";
      }
    } catch (error) {
      console.error("[sender-domain] Verification check failed:", error);
      Sentry.captureException(error, {
        tags: { source: "sender-domain", feature: "verification" },
        extra: { domainId, domain, organizationId },
      });
      newStatus = "failed";
    }

    // Update database
    const updated = await sql`
      UPDATE app.sender_domains
      SET
        status = ${newStatus},
        last_checked_at = NOW(),
        verified_at = ${newStatus === "verified" ? new Date().toISOString() : null},
        updated_at = NOW()
      WHERE id = ${domainId}
      RETURNING *
    `;

    return mapRowToDomain(updated[0] as Record<string, unknown>);
  },

  /**
   * List all domains for an organization.
   */
  async getDomains(organizationId: string): Promise<SenderDomain[]> {
    const rows = await sql`
      SELECT * FROM app.sender_domains
      WHERE organization_id = ${organizationId}
      ORDER BY created_at DESC
    `;

    return (rows as Array<Record<string, unknown>>).map(mapRowToDomain);
  },

  /**
   * Remove a sender domain.
   */
  async removeDomain(domainId: string, organizationId: string): Promise<void> {
    const rows = await sql`
      SELECT domain FROM app.sender_domains
      WHERE id = ${domainId} AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      throw new Error("Domain not found");
    }

    // Remove from SMTP2GO if configured
    const domain = (rows[0] as { domain: string }).domain;
    try {
      await smtp2goRequest("domain/delete", { domain });
    } catch {
      // Non-fatal -- continue with local deletion
    }

    await sql`
      DELETE FROM app.sender_domains
      WHERE id = ${domainId} AND organization_id = ${organizationId}
    `;
  },
};
