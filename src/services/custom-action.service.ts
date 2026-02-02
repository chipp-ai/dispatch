/**
 * Custom Action Service
 *
 * Business logic for user-defined tools (custom actions).
 * Handles CRUD operations and tool execution.
 */

import { sql } from "../db/client.ts";
import { ForbiddenError, NotFoundError } from "../utils/errors.ts";
import { applicationService } from "./application.service.ts";
import { validateUrl } from "./url-validation.service.ts";

export interface UserDefinedTool {
  id: string;
  application_id: string;
  name: string;
  slug: string | null;
  description: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers: unknown[]; // JSONB array
  path_params: unknown[]; // JSONB array
  query_params: unknown[]; // JSONB array
  body_params: unknown[]; // JSONB array
  variables: unknown | null; // JSONB
  present_tense_verb: string | null;
  past_tense_verb: string | null;
  collection_id: string | null;
  original_action_id: string | null;
  is_client_side: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateToolParams {
  applicationId: string;
  userId: string;
  name: string;
  slug?: string;
  description: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: unknown[];
  pathParams?: unknown[];
  queryParams?: unknown[];
  bodyParams?: unknown[];
  variables?: unknown;
  presentTenseVerb?: string;
  pastTenseVerb?: string;
}

export interface UpdateToolParams {
  name?: string;
  description?: string;
  url?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: unknown[];
  pathParams?: unknown[];
  queryParams?: unknown[];
  bodyParams?: unknown[];
  variables?: unknown;
  presentTenseVerb?: string;
  pastTenseVerb?: string;
}

export interface ExecuteToolParams {
  toolId: string;
  sessionId: string;
  userId: string;
  parameters: Record<string, unknown>;
}

/**
 * Generate slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .substring(0, 100);
}

export const customActionService = {
  /**
   * List tools for an application (requires developer userId for access check)
   */
  async list(
    applicationId: string,
    userId: string
  ): Promise<UserDefinedTool[]> {
    // Verify access
    await applicationService.get(applicationId, userId);

    const result = await sql`
      SELECT
        id,
        application_id,
        name,
        slug,
        description,
        url,
        method,
        headers,
        path_params,
        query_params,
        body_params,
        variables,
        present_tense_verb,
        past_tense_verb,
        collection_id,
        original_action_id,
        is_client_side,
        created_at,
        updated_at
      FROM app.user_defined_tools
      WHERE application_id = ${applicationId}::uuid
      ORDER BY created_at DESC
    `;

    return result as unknown as UserDefinedTool[];
  },

  /**
   * List tools for an application without ownership verification.
   * Used by consumer chat where the consumer has already been verified
   * to have access to the app via app middleware.
   */
  async listForApp(applicationId: string): Promise<UserDefinedTool[]> {
    const result = await sql`
      SELECT
        id,
        application_id,
        name,
        slug,
        description,
        url,
        method,
        headers,
        path_params,
        query_params,
        body_params,
        variables,
        present_tense_verb,
        past_tense_verb,
        collection_id,
        original_action_id,
        is_client_side,
        created_at,
        updated_at
      FROM app.user_defined_tools
      WHERE application_id = ${applicationId}::uuid
        AND is_client_side = false
      ORDER BY created_at DESC
    `;

    return result as unknown as UserDefinedTool[];
  },

  /**
   * Get a single tool
   */
  async get(toolId: string, userId: string): Promise<UserDefinedTool> {
    // Validate UUID format first to avoid PostgresError
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(toolId)) {
      throw new NotFoundError("Tool", toolId);
    }

    const result = await sql`
      SELECT
        id,
        application_id,
        name,
        slug,
        description,
        url,
        method,
        headers,
        path_params,
        query_params,
        body_params,
        variables,
        present_tense_verb,
        past_tense_verb,
        collection_id,
        original_action_id,
        is_client_side,
        created_at,
        updated_at
      FROM app.user_defined_tools
      WHERE id = ${toolId}::uuid
    `;

    if (result.length === 0) {
      throw new NotFoundError("Tool", toolId);
    }

    const tool = result[0] as UserDefinedTool;

    // Verify access
    await applicationService.get(tool.application_id, userId);

    return tool;
  },

  /**
   * Create a new tool
   */
  async create(params: CreateToolParams): Promise<UserDefinedTool> {
    const {
      applicationId,
      userId,
      name,
      slug,
      description,
      url,
      method,
      headers = [],
      pathParams = [],
      queryParams = [],
      bodyParams = [],
      variables,
      presentTenseVerb,
      pastTenseVerb,
    } = params;

    // Verify access
    await applicationService.get(applicationId, userId);

    // Validate URL (SSRF prevention)
    const { isValid, error } = await validateUrl(url);
    if (!isValid) {
      throw new Error(`Invalid URL: ${error}`);
    }

    // Generate slug if not provided
    const toolSlug = slug || generateSlug(name);

    // Check for duplicate slug
    const existing = await sql`
      SELECT id FROM app.user_defined_tools
      WHERE application_id = ${applicationId}::uuid
        AND slug = ${toolSlug}
    `;

    if (existing.length > 0) {
      throw new Error(`A tool with slug "${toolSlug}" already exists`);
    }

    const result = await sql`
      INSERT INTO app.user_defined_tools (
        application_id,
        name,
        slug,
        description,
        url,
        method,
        headers,
        path_params,
        query_params,
        body_params,
        variables,
        present_tense_verb,
        past_tense_verb,
        created_at,
        updated_at
      )
      VALUES (
        ${applicationId}::uuid,
        ${name},
        ${toolSlug},
        ${description},
        ${url},
        ${method},
        ${JSON.stringify(headers)}::jsonb,
        ${JSON.stringify(pathParams)}::jsonb,
        ${JSON.stringify(queryParams)}::jsonb,
        ${JSON.stringify(bodyParams)}::jsonb,
        ${variables ? JSON.stringify(variables) : null}::jsonb,
        ${presentTenseVerb || null},
        ${pastTenseVerb || null},
        NOW(),
        NOW()
      )
      RETURNING
        id,
        application_id,
        name,
        slug,
        description,
        url,
        method,
        headers,
        path_params,
        query_params,
        body_params,
        variables,
        present_tense_verb,
        past_tense_verb,
        collection_id,
        original_action_id,
        is_client_side,
        created_at,
        updated_at
    `;

    return result[0] as UserDefinedTool;
  },

  /**
   * Update a tool
   */
  async update(
    toolId: string,
    userId: string,
    params: UpdateToolParams
  ): Promise<UserDefinedTool> {
    // Get existing tool to verify access
    const existing = await this.get(toolId, userId);

    const updates: string[] = [];
    const values: unknown[] = [];

    if (params.name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(params.name);
    }

    if (params.description !== undefined) {
      updates.push(`description = $${values.length + 1}`);
      values.push(params.description);
    }

    if (params.url !== undefined) {
      // Validate URL
      const { isValid, error } = await validateUrl(params.url);
      if (!isValid) {
        throw new Error(`Invalid URL: ${error}`);
      }
      updates.push(`url = $${values.length + 1}`);
      values.push(params.url);
    }

    if (params.method !== undefined) {
      updates.push(`method = $${values.length + 1}`);
      values.push(params.method);
    }

    if (params.headers !== undefined) {
      updates.push(`headers = $${values.length + 1}::jsonb`);
      values.push(JSON.stringify(params.headers));
    }

    if (params.pathParams !== undefined) {
      updates.push(`path_params = $${values.length + 1}::jsonb`);
      values.push(JSON.stringify(params.pathParams));
    }

    if (params.queryParams !== undefined) {
      updates.push(`query_params = $${values.length + 1}::jsonb`);
      values.push(JSON.stringify(params.queryParams));
    }

    if (params.bodyParams !== undefined) {
      updates.push(`body_params = $${values.length + 1}::jsonb`);
      values.push(JSON.stringify(params.bodyParams));
    }

    if (params.variables !== undefined) {
      updates.push(`variables = $${values.length + 1}::jsonb`);
      values.push(JSON.stringify(params.variables));
    }

    if (params.presentTenseVerb !== undefined) {
      updates.push(`present_tense_verb = $${values.length + 1}`);
      values.push(params.presentTenseVerb);
    }

    if (params.pastTenseVerb !== undefined) {
      updates.push(`past_tense_verb = $${values.length + 1}`);
      values.push(params.pastTenseVerb);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(toolId);

    const query = `
      UPDATE app.user_defined_tools
      SET ${updates.join(", ")}
      WHERE id = $${values.length}::uuid
      RETURNING
        id,
        application_id,
        name,
        slug,
        description,
        url,
        method,
        headers,
        path_params,
        query_params,
        body_params,
        variables,
        present_tense_verb,
        past_tense_verb,
        collection_id,
        original_action_id,
        is_client_side,
        created_at,
        updated_at
    `;

    const result = await sql.unsafe(query, values as any);
    return result[0] as unknown as UserDefinedTool;
  },

  /**
   * Delete a tool
   */
  async delete(toolId: string, userId: string): Promise<void> {
    // Verify access
    await this.get(toolId, userId);

    await sql`
      DELETE FROM app.user_defined_tools
      WHERE id = ${toolId}::uuid
    `;
  },
};
