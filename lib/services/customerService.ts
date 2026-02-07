import { db } from "../db";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

export interface Customer {
  id: string;
  name: string;
  slug: string;
  slackChannelId: string | null;
  portalToken: string;
  brandColor: string | null;
  logoUrl: string | null;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerWithIssueCount extends Customer {
  issueCount: number;
}

interface CustomerRow {
  id: string;
  name: string;
  slug: string;
  slack_channel_id: string | null;
  portal_token: string;
  brand_color: string | null;
  logo_url: string | null;
  workspace_id: string;
  created_at: Date;
  updated_at: Date;
}

interface CustomerRowWithCount extends CustomerRow {
  issue_count: string;
}

/**
 * Generate a secure portal token
 */
function generatePortalToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Map database row to Customer interface
 */
function mapRowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    slackChannelId: row.slack_channel_id,
    portalToken: row.portal_token,
    brandColor: row.brand_color,
    logoUrl: row.logo_url,
    workspaceId: row.workspace_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Validate a portal token and return the associated customer
 */
export async function validatePortalToken(
  token: string
): Promise<Customer | null> {
  const customer = await db.queryOne<CustomerRow>(
    `SELECT * FROM chipp_customer WHERE portal_token = $1`,
    [token]
  );

  if (!customer) return null;
  return mapRowToCustomer(customer);
}

/**
 * Get customer by slug within a workspace
 */
export async function getCustomerBySlug(
  workspaceId: string,
  slug: string
): Promise<Customer | null> {
  const customer = await db.queryOne<CustomerRow>(
    `SELECT * FROM chipp_customer WHERE workspace_id = $1 AND slug = $2`,
    [workspaceId, slug]
  );

  if (!customer) return null;
  return mapRowToCustomer(customer);
}

/**
 * Get customer by ID
 */
export async function getCustomerById(id: string): Promise<Customer | null> {
  const customer = await db.queryOne<CustomerRow>(
    `SELECT * FROM chipp_customer WHERE id = $1`,
    [id]
  );

  if (!customer) return null;
  return mapRowToCustomer(customer);
}

/**
 * Get customer by Slack channel ID
 */
export async function getCustomerBySlackChannel(
  slackChannelId: string
): Promise<Customer | null> {
  const customer = await db.queryOne<CustomerRow>(
    `SELECT * FROM chipp_customer WHERE slack_channel_id = $1`,
    [slackChannelId]
  );

  if (!customer) return null;
  return mapRowToCustomer(customer);
}

/**
 * List all customers in a workspace
 */
export async function listCustomers(
  workspaceId: string
): Promise<CustomerWithIssueCount[]> {
  const customers = await db.query<CustomerRowWithCount>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM chipp_issue WHERE customer_id = c.id) as issue_count
     FROM chipp_customer c
     WHERE c.workspace_id = $1
     ORDER BY c.name ASC`,
    [workspaceId]
  );

  return customers.map((c) => ({
    ...mapRowToCustomer(c),
    issueCount: parseInt(c.issue_count, 10),
  }));
}

/**
 * Create a new customer
 */
export async function createCustomer(params: {
  workspaceId: string;
  name: string;
  slug: string;
  slackChannelId?: string;
  brandColor?: string;
  logoUrl?: string;
}): Promise<Customer> {
  const id = uuidv4();
  const portalToken = generatePortalToken();
  const sanitizedSlug = params.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const customer = await db.queryOne<CustomerRow>(
    `INSERT INTO chipp_customer (id, workspace_id, name, slug, slack_channel_id, portal_token, brand_color, logo_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     RETURNING *`,
    [
      id,
      params.workspaceId,
      params.name,
      sanitizedSlug,
      params.slackChannelId || null,
      portalToken,
      params.brandColor || null,
      params.logoUrl || null,
    ]
  );

  return mapRowToCustomer(customer!);
}

/**
 * Update a customer
 */
export async function updateCustomer(
  id: string,
  params: {
    name?: string;
    slug?: string;
    slackChannelId?: string | null;
    brandColor?: string | null;
    logoUrl?: string | null;
  }
): Promise<Customer> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(params.name);
  }
  if (params.slug !== undefined) {
    updates.push(`slug = $${paramIndex++}`);
    values.push(params.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
  }
  if (params.slackChannelId !== undefined) {
    updates.push(`slack_channel_id = $${paramIndex++}`);
    values.push(params.slackChannelId);
  }
  if (params.brandColor !== undefined) {
    updates.push(`brand_color = $${paramIndex++}`);
    values.push(params.brandColor);
  }
  if (params.logoUrl !== undefined) {
    updates.push(`logo_url = $${paramIndex++}`);
    values.push(params.logoUrl);
  }
  updates.push(`updated_at = NOW()`);

  values.push(id);

  const customer = await db.queryOne<CustomerRow>(
    `UPDATE chipp_customer SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return mapRowToCustomer(customer!);
}

/**
 * Regenerate portal token for a customer
 */
export async function regeneratePortalToken(id: string): Promise<string> {
  const newToken = generatePortalToken();

  await db.query(
    `UPDATE chipp_customer SET portal_token = $1, updated_at = NOW() WHERE id = $2`,
    [newToken, id]
  );

  return newToken;
}

/**
 * Delete a customer
 */
export async function deleteCustomer(id: string): Promise<void> {
  // First, unlink all issues from this customer
  await db.query(
    `UPDATE chipp_issue SET customer_id = NULL WHERE customer_id = $1`,
    [id]
  );

  // Then delete the customer
  await db.query(`DELETE FROM chipp_customer WHERE id = $1`, [id]);
}

/**
 * Build portal URL for a customer
 */
export function buildPortalUrl(
  baseUrl: string,
  customerSlug: string,
  token: string,
  issueIdentifier?: string
): string {
  const path = issueIdentifier
    ? `/portal/${customerSlug}/issue/${issueIdentifier}`
    : `/portal/${customerSlug}`;

  return `${baseUrl}${path}?token=${token}`;
}

/**
 * Get or create a customer by Slack channel ID.
 * Auto-generates slug and name from channel ID if creating new customer.
 */
export async function getOrCreateCustomerBySlackChannel(
  workspaceId: string,
  slackChannelId: string,
  channelName?: string
): Promise<Customer> {
  // Check if customer exists for this channel
  const existing = await getCustomerBySlackChannel(slackChannelId);
  if (existing) {
    return existing;
  }

  // Auto-generate slug from channel ID (lowercase, safe for URLs)
  const slug = `slack-${slackChannelId.toLowerCase()}`;
  // Use channel name if provided, otherwise use a generic name
  const name = channelName || `Customer ${slackChannelId}`;

  return createCustomer({
    workspaceId,
    name,
    slug,
    slackChannelId,
  });
}
