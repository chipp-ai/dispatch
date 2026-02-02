/**
 * Custom Action Validation Schemas
 */

import { z } from "zod";

export const createToolSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().max(100).optional(),
  description: z.string().min(1),
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  headers: z.array(z.unknown()).optional(),
  pathParams: z.array(z.unknown()).optional(),
  queryParams: z.array(z.unknown()).optional(),
  bodyParams: z.array(z.unknown()).optional(),
  variables: z.record(z.unknown()).optional(),
  presentTenseVerb: z.string().max(100).optional(),
  pastTenseVerb: z.string().max(100).optional(),
});

export const updateToolSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().min(1).optional(),
  url: z.string().url().optional(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
  headers: z.array(z.unknown()).optional(),
  pathParams: z.array(z.unknown()).optional(),
  queryParams: z.array(z.unknown()).optional(),
  bodyParams: z.array(z.unknown()).optional(),
  variables: z.record(z.unknown()).optional(),
  presentTenseVerb: z.string().max(100).optional(),
  pastTenseVerb: z.string().max(100).optional(),
});

export type CreateToolInput = z.infer<typeof createToolSchema>;
export type UpdateToolInput = z.infer<typeof updateToolSchema>;

