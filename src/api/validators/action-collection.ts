/**
 * Action Collection Validators
 *
 * Zod schemas for action collection API validation
 */

import { z } from "zod";

// Scope enum for filtering (maps to is_public boolean in DB)
export const collectionScopeSchema = z.enum(["PRIVATE", "PUBLIC"]);

// Collection schemas
export const createCollectionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isPublic: z.boolean().default(false),
});

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const listCollectionsQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  scope: collectionScopeSchema.optional(),
  includeActions: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Action template schemas
export const addActionSchema = z.object({
  actionData: z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    urlTemplate: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    bodyTemplate: z.any().optional(),
    parametersSchema: z.any().optional(),
    responseMapping: z.any().optional(),
  }),
});

// Contribution schemas (kept for API compatibility, but feature is disabled)
export const createContributionSchema = z.object({
  actionId: z.string().uuid(),
  contribution: z.record(z.string(), z.any()),
  description: z.string().min(1).max(1000),
});

export const reviewContributionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().max(2000).optional(),
});

export const listContributionsQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "MERGED"]).optional(),
});

// Type exports
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type ListCollectionsQuery = z.infer<typeof listCollectionsQuerySchema>;
export type AddActionInput = z.infer<typeof addActionSchema>;
export type CreateContributionInput = z.infer<typeof createContributionSchema>;
export type ReviewContributionInput = z.infer<typeof reviewContributionSchema>;
