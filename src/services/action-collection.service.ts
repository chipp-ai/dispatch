/**
 * Action Collection Service
 *
 * CRUD operations for action collections and action templates
 */

import { sql } from "../db/client.ts";
import type { JSONObject, JSONValue } from "../db/schema.ts";
import {
  NotFoundError,
  ForbiddenError,
} from "../api/middleware/errorHandler.ts";

// ============================================
// Types
// ============================================

export interface ActionCollection {
  id: string;
  name: string;
  description: string | null;
  developerId: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionTemplate {
  id: string;
  collectionId: string;
  name: string;
  description: string | null;
  method: string;
  urlTemplate: string;
  headers: JSONObject | null;
  bodyTemplate: JSONValue | null;
  parametersSchema: JSONValue | null;
  responseMapping: JSONValue | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateCollectionInput {
  name: string;
  description?: string;
  isPublic?: boolean;
}

interface UpdateCollectionInput {
  name?: string;
  description?: string;
  isPublic?: boolean;
}

interface ListCollectionsOptions {
  userId: string;
  workspaceId?: string;
  scope?: "PUBLIC" | "PRIVATE" | "WORKSPACE";
  includeActions?: boolean;
  limit?: number;
  offset?: number;
}

interface CreateTemplateInput {
  name: string;
  description?: string;
  method: string;
  urlTemplate: string;
  headers?: JSONObject;
  bodyTemplate?: JSONValue;
  parametersSchema?: JSONValue;
  responseMapping?: JSONValue;
}

// ============================================
// Collection Operations
// ============================================

/**
 * Check if user can access a collection
 */
async function canAccessCollection(
  collection: ActionCollection,
  userId: string
): Promise<boolean> {
  // Creator always has access
  if (collection.developerId === userId) return true;

  // Public collections are accessible to all
  if (collection.isPublic) return true;

  return false;
}

/**
 * Create a new action collection
 */
async function create(
  userId: string,
  input: CreateCollectionInput
): Promise<ActionCollection> {
  const { name, description, isPublic = false } = input;

  const [collection] = await sql`
    INSERT INTO app.action_collections (
      name,
      description,
      developer_id,
      is_public
    )
    VALUES (
      ${name},
      ${description || null},
      ${userId},
      ${isPublic}
    )
    RETURNING
      id,
      name,
      description,
      developer_id as "developerId",
      is_public as "isPublic",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;

  return collection as ActionCollection;
}

/**
 * Get a collection by ID
 */
async function get(
  collectionId: string,
  userId: string
): Promise<ActionCollection> {
  const [collection] = await sql`
    SELECT
      id,
      name,
      description,
      developer_id as "developerId",
      is_public as "isPublic",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM app.action_collections
    WHERE id = ${collectionId}
  `;

  if (!collection) {
    throw new NotFoundError("Collection not found");
  }

  const hasAccess = await canAccessCollection(
    collection as ActionCollection,
    userId
  );
  if (!hasAccess) {
    throw new ForbiddenError("You don't have access to this collection");
  }

  return collection as ActionCollection;
}

/**
 * List collections accessible to user
 */
async function list(options: ListCollectionsOptions): Promise<{
  collections: ActionCollection[];
  proPublicCollections: ActionCollection[];
}> {
  const { userId, scope, limit = 50, offset = 0 } = options;

  // Build query based on scope
  let collections: ActionCollection[];

  if (scope === "PUBLIC") {
    // Only public collections
    collections = await sql`
      SELECT
        id,
        name,
        description,
        developer_id as "developerId",
        is_public as "isPublic",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM app.action_collections
      WHERE is_public = true
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  } else if (scope === "PRIVATE") {
    // Only user's private collections
    collections = await sql`
      SELECT
        id,
        name,
        description,
        developer_id as "developerId",
        is_public as "isPublic",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM app.action_collections
      WHERE developer_id = ${userId}
        AND is_public = false
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  } else {
    // Default: user's collections (all) + public collections
    collections = await sql`
      SELECT
        id,
        name,
        description,
        developer_id as "developerId",
        is_public as "isPublic",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM app.action_collections
      WHERE developer_id = ${userId}
         OR is_public = true
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  }

  // Get public collections separately for proPublicCollections
  const proPublicCollections = await sql`
    SELECT
      id,
      name,
      description,
      developer_id as "developerId",
      is_public as "isPublic",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM app.action_collections
    WHERE is_public = true
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return {
    collections: collections as unknown as ActionCollection[],
    proPublicCollections: proPublicCollections as unknown as ActionCollection[],
  };
}

/**
 * Update a collection
 */
async function update(
  collectionId: string,
  userId: string,
  input: UpdateCollectionInput
): Promise<ActionCollection> {
  const collection = await get(collectionId, userId);

  // Only creator can update
  if (collection.developerId !== userId) {
    throw new ForbiddenError("Only collection owner can update");
  }

  // If no fields to update, return existing collection
  if (
    input.name === undefined &&
    input.description === undefined &&
    input.isPublic === undefined
  ) {
    return collection;
  }

  // Use existing values for undefined fields
  const newName = input.name !== undefined ? input.name : collection.name;
  const newDescription =
    input.description !== undefined
      ? input.description
      : collection.description;
  const newIsPublic =
    input.isPublic !== undefined ? input.isPublic : collection.isPublic;

  const [updated] = await sql`
    UPDATE app.action_collections
    SET
      name = ${newName},
      description = ${newDescription},
      is_public = ${newIsPublic},
      updated_at = NOW()
    WHERE id = ${collectionId}
    RETURNING
      id,
      name,
      description,
      developer_id as "developerId",
      is_public as "isPublic",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;

  return updated as ActionCollection;
}

/**
 * Delete a collection
 */
async function remove(collectionId: string, userId: string): Promise<void> {
  const collection = await get(collectionId, userId);

  if (collection.developerId !== userId) {
    throw new ForbiddenError("Only collection owner can delete");
  }

  await sql`
    DELETE FROM app.action_collections
    WHERE id = ${collectionId}
  `;
}

// ============================================
// Action Template Operations
// ============================================

/**
 * Get action templates in a collection
 */
async function getActions(
  collectionId: string,
  userId: string
): Promise<ActionTemplate[]> {
  // Verify access
  await get(collectionId, userId);

  const actions = await sql`
    SELECT
      id,
      collection_id as "collectionId",
      name,
      description,
      method,
      url_template as "urlTemplate",
      headers,
      body_template as "bodyTemplate",
      parameters_schema as "parametersSchema",
      response_mapping as "responseMapping",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM app.action_templates
    WHERE collection_id = ${collectionId}
    ORDER BY created_at ASC
  `;

  return actions as unknown as ActionTemplate[];
}

/**
 * Add an action template to a collection
 */
async function addAction(
  collectionId: string,
  userId: string,
  actionData: CreateTemplateInput
): Promise<ActionTemplate> {
  const collection = await get(collectionId, userId);

  if (collection.developerId !== userId) {
    throw new ForbiddenError("Only collection owner can add actions");
  }

  const [action] = await sql`
    INSERT INTO app.action_templates (
      collection_id,
      name,
      description,
      method,
      url_template,
      headers,
      body_template,
      parameters_schema,
      response_mapping
    )
    VALUES (
      ${collectionId},
      ${actionData.name},
      ${actionData.description || null},
      ${actionData.method},
      ${actionData.urlTemplate},
      ${sql.json(actionData.headers ?? null)},
      ${sql.json(actionData.bodyTemplate ?? null)},
      ${sql.json(actionData.parametersSchema ?? null)},
      ${sql.json(actionData.responseMapping ?? null)}
    )
    RETURNING
      id,
      collection_id as "collectionId",
      name,
      description,
      method,
      url_template as "urlTemplate",
      headers,
      body_template as "bodyTemplate",
      parameters_schema as "parametersSchema",
      response_mapping as "responseMapping",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;

  return action as ActionTemplate;
}

/**
 * Remove an action template from a collection
 */
async function removeAction(
  collectionId: string,
  actionId: string,
  userId: string
): Promise<void> {
  const collection = await get(collectionId, userId);

  if (collection.developerId !== userId) {
    throw new ForbiddenError("Only collection owner can remove actions");
  }

  await sql`
    DELETE FROM app.action_templates
    WHERE id = ${actionId}
      AND collection_id = ${collectionId}
  `;
}

// ============================================
// Contribution Stubs (table doesn't exist, return empty/error)
// ============================================

async function listContributions(
  _collectionId: string,
  _userId: string,
  _status?: string
): Promise<never[]> {
  // Contributions table doesn't exist - return empty array
  return [];
}

async function createContribution(
  _userId: string,
  _input: {
    collectionId: string;
    actionId: string;
    contribution: unknown;
    description: string;
  }
): Promise<never> {
  throw new NotFoundError("Contributions feature not available");
}

async function getContribution(
  _contributionId: string,
  _userId: string
): Promise<never> {
  throw new NotFoundError("Contributions feature not available");
}

async function reviewContribution(
  _contributionId: string,
  _userId: string,
  _input: { status: string; reviewNotes?: string }
): Promise<never> {
  throw new NotFoundError("Contributions feature not available");
}

export const actionCollectionService = {
  // Collections
  create,
  get,
  list,
  update,
  remove,

  // Collection actions
  getActions,
  addAction,
  removeAction,

  // Contributions (stubs)
  createContribution,
  listContributions,
  getContribution,
  reviewContribution,
};
