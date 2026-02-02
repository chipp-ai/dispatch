/**
 * Knowledge Source Validation Schemas
 */

import { z } from "zod";

export const createKnowledgeSourceSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  type: z.enum([
    "file",
    "url",
    "google_drive",
    "notion",
    "text",
    "qa",
    "sitemap",
    "youtube",
    "confluence",
  ]),
  name: z.string().min(1).max(255),
  url: z.string().url().optional(),
  filePath: z.string().optional(),
  metadata: z.any().optional(),
});

export const updateKnowledgeSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  metadata: z.any().optional(),
});

export const listKnowledgeSourcesQuerySchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  status: z
    .enum(["pending", "processing", "completed", "failed", "deleting"] as const)
    .optional(),
  type: z
    .enum([
      "file",
      "url",
      "google_drive",
      "notion",
      "text",
      "qa",
      "sitemap",
      "youtube",
      "confluence",
    ])
    .optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(100))
    .optional(),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(0))
    .optional(),
});

export type CreateKnowledgeSourceInput = z.infer<
  typeof createKnowledgeSourceSchema
>;
export type UpdateKnowledgeSourceInput = z.infer<
  typeof updateKnowledgeSourceSchema
>;
export type ListKnowledgeSourcesQuery = z.infer<
  typeof listKnowledgeSourcesQuerySchema
>;
