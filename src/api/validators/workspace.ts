/**
 * Workspace Validation Schemas
 *
 * Zod schemas for request validation.
 * These match the API contract types in shared/api-types.
 */

import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  description: z.string().max(500).optional(),
  organizationId: z.string().uuid().optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  pictureUrl: z.string().url().optional(),
});

export const addMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  // Note: "owner" role cannot be assigned via this endpoint for security
  // Ownership can only be transferred via the dedicated transfer endpoint
  role: z.enum(["admin", "member"]).default("member"),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["EDITOR", "VIEWER"]),
});

// HQ Schemas
export const updateHQAccessModeSchema = z.object({
  accessMode: z.enum(["public", "public_paid", "private", "paid"]),
});

export const updateWorkspaceSettingsSchema = z.object({
  enableDuplication: z.boolean().optional(),
});

// Export types derived from schemas
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type UpdateHQAccessModeInput = z.infer<typeof updateHQAccessModeSchema>;
export type UpdateWorkspaceSettingsInput = z.infer<
  typeof updateWorkspaceSettingsSchema
>;
