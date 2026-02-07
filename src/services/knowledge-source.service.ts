/**
 * Knowledge Source Service
 *
 * Business logic for managing knowledge sources (files, URLs, etc.)
 */

import { sql } from "../db/client.ts";
import type { JSONValue } from "../db/schema.ts";
import { ForbiddenError, NotFoundError } from "../utils/errors.ts";
import { applicationService } from "./application.service.ts";
import { isFirecrawlAvailable, firecrawlService } from "./firecrawl.service.ts";
import {
  processUrlContent,
  processKnowledgeSource,
} from "./rag-ingestion.service.ts";
import { billingService } from "./billing.service.ts";
import { log } from "@/lib/logger.ts";

export type KnowledgeSourceType =
  | "file"
  | "url"
  | "google_drive"
  | "notion"
  | "text"
  | "qa"
  | "sitemap"
  | "youtube"
  | "confluence";

export type KnowledgeSourceStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "deleting";

export interface KnowledgeSource {
  id: string;
  application_id: string;
  type: KnowledgeSourceType;
  name: string;
  url: string | null;
  file_path: string | null;
  status: KnowledgeSourceStatus;
  error_message: string | null;
  chunk_count: number;
  metadata: JSONValue | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateKnowledgeSourceParams {
  applicationId: string;
  userId: string;
  type: KnowledgeSourceType;
  name: string;
  url?: string;
  filePath?: string;
  metadata?: JSONValue;
}

export interface UpdateKnowledgeSourceParams {
  name?: string;
  metadata?: JSONValue;
}

export interface ListKnowledgeSourcesParams {
  applicationId: string;
  userId: string;
  status?: KnowledgeSourceStatus;
  type?: KnowledgeSourceType;
  limit?: number;
  offset?: number;
}

export const knowledgeSourceService = {
  /**
   * List knowledge sources for an application
   */
  async list(params: ListKnowledgeSourcesParams): Promise<KnowledgeSource[]> {
    const {
      applicationId,
      userId,
      status,
      type,
      limit = 50,
      offset = 0,
    } = params;

    // Verify user has access to the application
    await applicationService.get(applicationId, userId);

    let query = sql`
      SELECT
        id,
        application_id,
        type,
        name,
        url,
        file_path,
        status,
        error_message,
        chunk_count,
        metadata,
        created_at,
        updated_at
      FROM rag.knowledge_sources
      WHERE application_id = ${applicationId}::uuid
    `;

    if (status) {
      query = sql`${query} AND status = ${status}`;
    }

    if (type) {
      query = sql`${query} AND type = ${type}`;
    }

    query = sql`
      ${query}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const result = await query;
    return result as unknown as KnowledgeSource[];
  },

  /**
   * Get a single knowledge source
   */
  async get(id: string, userId: string): Promise<KnowledgeSource> {
    const result = await sql`
      SELECT
        ks.id,
        ks.application_id,
        ks.type,
        ks.name,
        ks.url,
        ks.file_path,
        ks.status,
        ks.error_message,
        ks.chunk_count,
        ks.metadata,
        ks.created_at,
        ks.updated_at
      FROM rag.knowledge_sources ks
      WHERE ks.id = ${id}::uuid
    `;

    if (result.length === 0) {
      throw new NotFoundError("Knowledge source", id);
    }

    const source = result[0] as KnowledgeSource;

    // Verify user has access to the application
    await applicationService.get(source.application_id, userId);

    return source;
  },

  /**
   * Create a new knowledge source
   */
  async create(params: CreateKnowledgeSourceParams): Promise<KnowledgeSource> {
    const { applicationId, userId, type, name, url, filePath, metadata } =
      params;

    // Verify user has access
    await applicationService.get(applicationId, userId);

    const result = await sql`
      INSERT INTO rag.knowledge_sources (
        application_id,
        type,
        name,
        url,
        file_path,
        status,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        ${applicationId}::uuid,
        ${type},
        ${name},
        ${url || null},
        ${filePath || null},
        'pending',
        ${sql.json(metadata ?? null)},
        NOW(),
        NOW()
      )
      RETURNING
        id,
        application_id,
        type,
        name,
        url,
        file_path,
        status,
        error_message,
        chunk_count,
        metadata,
        created_at,
        updated_at
    `;

    return result[0] as KnowledgeSource;
  },

  /**
   * Update a knowledge source
   */
  async update(
    id: string,
    userId: string,
    params: UpdateKnowledgeSourceParams
  ): Promise<KnowledgeSource> {
    // Get existing source to verify access
    const existing = await this.get(id, userId);

    // If no updates provided, return existing
    if (params.name === undefined && params.metadata === undefined) {
      return existing;
    }

    // Use the new values or keep the existing ones
    const name = params.name !== undefined ? params.name : existing.name;
    const metadata =
      params.metadata !== undefined ? params.metadata : existing.metadata;

    const result = await sql`
      UPDATE rag.knowledge_sources
      SET
        name = ${name},
        metadata = ${metadata !== null ? sql.json(metadata) : null},
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING
        id,
        application_id,
        type,
        name,
        url,
        file_path,
        status,
        error_message,
        chunk_count,
        metadata,
        created_at,
        updated_at
    `;

    return result[0] as KnowledgeSource;
  },

  /**
   * Delete a knowledge source and all its chunks
   */
  async delete(id: string, userId: string): Promise<void> {
    // Verify access
    await this.get(id, userId);

    // Delete chunks first (CASCADE should handle this, but being explicit)
    await sql`
      DELETE FROM rag.text_chunks
      WHERE knowledge_source_id = ${id}::uuid
    `;

    // Delete the knowledge source
    await sql`
      DELETE FROM rag.knowledge_sources
      WHERE id = ${id}::uuid
    `;
  },

  /**
   * Trigger reprocessing of a knowledge source
   */
  async reprocess(id: string, userId: string): Promise<void> {
    const source = await this.get(id, userId);

    // Update status to pending
    await sql`
      UPDATE rag.knowledge_sources
      SET
        status = 'pending',
        error_message = NULL,
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `;

    // Process in background - don't await
    const doReprocess = async () => {
      if (source.type === "url" && source.url && isFirecrawlAvailable()) {
        // Re-scrape URL via Firecrawl
        const { markdown, metadata } = await firecrawlService.scrapeUrl(
          source.url
        );

        await processUrlContent({
          knowledgeSourceId: id,
          applicationId: source.application_id,
          url: source.url,
          markdown,
          sourceMetadata: metadata as Record<string, unknown>,
          userId,
        });

        // Report usage
        const billingCtx = await getBillingContextForSource(
          source.application_id
        );
        if (billingCtx?.stripeCustomerId) {
          billingService.reportWebScrapeUsage({
            stripeCustomerId: billingCtx.stripeCustomerId,
            pagesScraped: 1,
            applicationId: source.application_id,
            knowledgeSourceId: id,
            useSandbox: billingCtx.useSandbox,
          });
        }
      } else {
        // Files or PG mode: delegate to existing processor
        await processKnowledgeSource({
          knowledgeSourceId: id,
          applicationId: source.application_id,
          userId,
        });
      }
    };

    doReprocess().catch((err) => {
      log.error("Reprocess failed", {
        source: "knowledge-source-service",
        feature: "reprocess",
        knowledgeSourceId: id,
        applicationId: source.application_id,
      }, err);
    });
  },
};

/**
 * Get billing context for an application
 */
async function getBillingContextForSource(
  applicationId: string
): Promise<{ stripeCustomerId: string | null; useSandbox: boolean } | null> {
  try {
    const result = await sql`
      SELECT
        o.stripe_customer_id,
        o.stripe_sandbox_customer_id,
        o.use_sandbox_for_usage_billing
      FROM app.applications a
      JOIN app.workspaces w ON a.workspace_id = w.id
      JOIN app.organizations o ON w.organization_id = o.id
      WHERE a.id = ${applicationId}::uuid
    `;

    if (result.length === 0) return null;

    const org = result[0];
    const useSandbox =
      Deno.env.get("USE_STRIPE_SANDBOX") === "true" ||
      Boolean(org.use_sandbox_for_usage_billing);

    const stripeCustomerId = useSandbox
      ? org.stripe_sandbox_customer_id
      : org.stripe_customer_id;

    return { stripeCustomerId: stripeCustomerId || null, useSandbox };
  } catch (error) {
    log.error("Failed to get billing context", {
      source: "knowledge-source-service",
      feature: "billing-context",
      applicationId,
    }, error);
    return null;
  }
}
