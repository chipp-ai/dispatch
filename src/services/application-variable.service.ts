/**
 * Application Variable Service
 *
 * Manages application-level variables that can be used across custom actions.
 * These are stored securely and can reference things like API keys.
 */

import { sql } from "../db/client.ts";

export interface ApplicationVariable {
  id: string;
  applicationId: string;
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "secret" | "url";
  description?: string;
  required: boolean;
  placeholder?: string;
  value?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateVariableInput {
  applicationId: string;
  userId: string;
  name: string;
  label: string;
  type?: ApplicationVariable["type"];
  description?: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
}

interface UpdateVariableInput {
  name?: string;
  label?: string;
  type?: ApplicationVariable["type"];
  description?: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
}

/**
 * Validate that the user owns the application
 */
async function validateAppOwnership(
  applicationId: string,
  userId: string
): Promise<void> {
  const result = await sql<{ id: string }[]>`
    SELECT id FROM app.applications
    WHERE id = ${applicationId}::uuid AND developer_id = ${userId}::uuid
  `;

  if (result.length === 0) {
    throw new Error("Application not found or access denied");
  }
}

/**
 * Validate variable name format
 */
function isValidVariableName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

class ApplicationVariableService {
  /**
   * List all variables for an application
   */
  async list(
    applicationId: string,
    userId: string
  ): Promise<ApplicationVariable[]> {
    await validateAppOwnership(applicationId, userId);

    const result = await sql<
      {
        id: string;
        application_id: string;
        name: string;
        label: string;
        type: string;
        description: string | null;
        required: boolean;
        placeholder: string | null;
        value: string | null;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      SELECT id, application_id, name, label, type, description,
             required, placeholder, value, created_at, updated_at
      FROM app.application_variables
      WHERE application_id = ${applicationId}::uuid
      ORDER BY name ASC
    `;

    return result.map((row) => ({
      id: row.id,
      applicationId: row.application_id,
      name: row.name,
      label: row.label,
      type: row.type as ApplicationVariable["type"],
      description: row.description || undefined,
      required: row.required,
      placeholder: row.placeholder || undefined,
      // Mask secret values
      value:
        row.type === "secret" && row.value
          ? "••••••••"
          : row.value || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get a single variable
   */
  async get(
    variableId: string,
    userId: string
  ): Promise<ApplicationVariable | null> {
    const result = await sql<
      {
        id: string;
        application_id: string;
        name: string;
        label: string;
        type: string;
        description: string | null;
        required: boolean;
        placeholder: string | null;
        value: string | null;
        created_at: Date;
        updated_at: Date;
        developer_id: string;
      }[]
    >`
      SELECT v.*, a.developer_id
      FROM app.application_variables v
      JOIN app.applications a ON a.id = v.application_id
      WHERE v.id = ${variableId}::uuid
    `;

    if (result.length === 0) return null;

    const row = result[0];
    if (row.developer_id !== userId) {
      throw new Error("Access denied");
    }

    return {
      id: row.id,
      applicationId: row.application_id,
      name: row.name,
      label: row.label,
      type: row.type as ApplicationVariable["type"],
      description: row.description || undefined,
      required: row.required,
      placeholder: row.placeholder || undefined,
      value:
        row.type === "secret" && row.value
          ? "••••••••"
          : row.value || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Create a new variable
   */
  async create(input: CreateVariableInput): Promise<ApplicationVariable> {
    await validateAppOwnership(input.applicationId, input.userId);

    // Validate name format
    if (!isValidVariableName(input.name)) {
      throw new Error(
        "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores"
      );
    }

    // Check for duplicate name
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM app.application_variables
      WHERE application_id = ${input.applicationId}::uuid
        AND name = ${input.name}
    `;

    if (existing.length > 0) {
      throw new Error(`Variable "${input.name}" already exists`);
    }

    const result = await sql<
      {
        id: string;
        application_id: string;
        name: string;
        label: string;
        type: string;
        description: string | null;
        required: boolean;
        placeholder: string | null;
        value: string | null;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      INSERT INTO app.application_variables (
        application_id, name, label, type, description,
        required, placeholder, value
      )
      VALUES (
        ${input.applicationId}::uuid,
        ${input.name},
        ${input.label},
        ${input.type || "string"},
        ${input.description || null},
        ${input.required || false},
        ${input.placeholder || null},
        ${input.value || null}
      )
      RETURNING id, application_id, name, label, type, description,
                required, placeholder, value, created_at, updated_at
    `;

    const row = result[0];
    return {
      id: row.id,
      applicationId: row.application_id,
      name: row.name,
      label: row.label,
      type: row.type as ApplicationVariable["type"],
      description: row.description || undefined,
      required: row.required,
      placeholder: row.placeholder || undefined,
      value:
        row.type === "secret" && row.value
          ? "••••••••"
          : row.value || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Update a variable
   */
  async update(
    variableId: string,
    userId: string,
    input: UpdateVariableInput
  ): Promise<ApplicationVariable> {
    // Verify access
    const current = await this.get(variableId, userId);
    if (!current) {
      throw new Error("Variable not found");
    }

    // Validate new name if provided
    if (input.name && input.name !== current.name) {
      if (!isValidVariableName(input.name)) {
        throw new Error(
          "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores"
        );
      }

      // Check for duplicate
      const existing = await sql<{ id: string }[]>`
        SELECT id FROM app.application_variables
        WHERE application_id = ${current.applicationId}::uuid
          AND name = ${input.name}
          AND id != ${variableId}::uuid
      `;

      if (existing.length > 0) {
        throw new Error(`Variable "${input.name}" already exists`);
      }
    }

    const result = await sql<
      {
        id: string;
        application_id: string;
        name: string;
        label: string;
        type: string;
        description: string | null;
        required: boolean;
        placeholder: string | null;
        value: string | null;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      UPDATE app.application_variables SET
        name = COALESCE(${input.name ?? null}, name),
        label = COALESCE(${input.label ?? null}, label),
        type = COALESCE(${input.type ?? null}, type),
        description = COALESCE(${input.description ?? null}, description),
        required = COALESCE(${input.required ?? null}, required),
        placeholder = COALESCE(${input.placeholder ?? null}, placeholder),
        value = COALESCE(${input.value ?? null}, value),
        updated_at = NOW()
      WHERE id = ${variableId}::uuid
      RETURNING id, application_id, name, label, type, description,
                required, placeholder, value, created_at, updated_at
    `;

    const row = result[0];
    return {
      id: row.id,
      applicationId: row.application_id,
      name: row.name,
      label: row.label,
      type: row.type as ApplicationVariable["type"],
      description: row.description || undefined,
      required: row.required,
      placeholder: row.placeholder || undefined,
      value:
        row.type === "secret" && row.value
          ? "••••••••"
          : row.value || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Delete a variable
   */
  async delete(variableId: string, userId: string): Promise<void> {
    // Verify access
    const current = await this.get(variableId, userId);
    if (!current) {
      throw new Error("Variable not found");
    }

    await sql`
      DELETE FROM app.application_variables
      WHERE id = ${variableId}::uuid
    `;
  }

  /**
   * Get the actual value for a variable (for tool execution)
   * This returns unmasked secrets
   */
  async getValueForExecution(
    applicationId: string,
    variableName: string
  ): Promise<string | null> {
    const result = await sql<{ value: string | null }[]>`
      SELECT value FROM app.application_variables
      WHERE application_id = ${applicationId}::uuid
        AND name = ${variableName}
    `;

    if (result.length === 0) return null;
    return result[0].value;
  }
}

export const applicationVariableService = new ApplicationVariableService();
