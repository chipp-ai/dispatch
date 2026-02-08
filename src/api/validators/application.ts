/**
 * Application Validation Schemas
 *
 * Zod schemas for application request validation.
 */

import { z } from "zod";
import { DEFAULT_MODEL_ID } from "../../config/models.ts";

export const createApplicationSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  description: z.string().max(2000).optional(),
  systemPrompt: z.string().max(10000).optional(),
  workspaceId: z.string().uuid("Invalid workspace ID"),
  modelId: z.string().default(DEFAULT_MODEL_ID),
  isPublic: z.boolean().default(false),
  brandStyles: z
    .object({
      primaryColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      logoUrl: z.string().url().optional().or(z.literal("")),
    })
    .optional(),
  suggestedMessages: z.array(z.string()).optional(),
  welcomeMessages: z.array(z.string()).optional(),
  creationSource: z.string().max(100).optional(),
});

export const updateApplicationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional().nullable(),
  systemPrompt: z.string().max(10000).optional().nullable(),
  pictureUrl: z.string().url().optional().nullable(),
  modelId: z.string().optional(),
  isPublic: z.boolean().optional(),
  brandStyles: z
    .object({
      inputTextHint: z.string().max(100).optional(),
      disclaimerText: z.string().max(200).optional(),
      primaryColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      botMessageColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      userMessageColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      logoUrl: z.string().url().optional().or(z.literal("")),
    })
    .optional()
    .nullable(),
  welcomeMessages: z.array(z.string()).optional().nullable(),
  suggestedMessages: z.array(z.string()).optional().nullable(),
  settings: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(256).max(16384).optional(),
      streamResponses: z.boolean().optional(),
      requireAuth: z.boolean().optional(),
      showSources: z.boolean().optional(),
    })
    .optional()
    .nullable(),
  customActions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().max(500),
        endpoint: z.string().url(),
        method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
      })
    )
    .optional()
    .nullable(),
  embeddingConfig: z
    .object({
      provider: z.enum(["local", "openai", "predictionguard", "custom"]),
      baseUrl: z.string().url().optional(),
      apiKey: z.string().optional(),
      model: z.string().optional(),
    })
    .optional()
    .nullable(),
  capabilities: z
    .object({
      voiceAgent: z
        .object({
          enabled: z.boolean().optional(),
          provider: z
            .enum(["openai", "elevenlabs", "google", "azure"])
            .optional(),
          voice: z
            .object({
              voiceId: z.string().optional(),
              language: z.string().optional(),
              pitch: z.number().optional(),
              speed: z.number().optional(),
            })
            .optional(),
          stt: z
            .object({
              provider: z.enum(["openai", "google", "azure"]).optional(),
              model: z.string().optional(),
              language: z.string().optional(),
            })
            .optional(),
          telephony: z
            .object({
              enabled: z.boolean().optional(),
              provider: z.enum(["twilio", "vonage"]).optional(),
              phoneNumber: z.string().optional(),
            })
            .optional(),
          interruption: z
            .object({
              enabled: z.boolean().optional(),
              threshold: z.number().min(0).max(1).optional(),
            })
            .optional(),
          systemPrompt: z.string().optional(),
          maxDuration: z.number().optional(),
          greeting: z.string().optional(),
        })
        .optional(),
      animationConfig: z
        .object({
          enabled: z.boolean().optional(),
          type: z.enum(["fade", "blur", "slideUp", "slideDown"]).optional(),
          duration: z.number().min(50).max(500).optional(),
          tokenize: z.enum(["word", "char"]).optional(),
          timingFunction: z
            .enum(["ease", "ease-in", "ease-out", "ease-in-out", "linear"])
            .optional(),
          preserveNewlines: z.boolean().optional(),
        })
        .optional(),
    })
    .optional()
    .nullable(),
});

export const duplicateApplicationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  workspaceId: z.string().uuid().optional(),
});

export const moveApplicationSchema = z.object({
  workspaceId: z.string().uuid("Target workspace ID is required"),
});

export const listApplicationsQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  includeDeleted: z
    .string()
    .transform((val) => val === "true")
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

export const searchApplicationsQuerySchema = z.object({
  q: z.string().min(1, "Search query is required").max(100),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(50))
    .optional()
    .default("10"),
});

// Export types derived from schemas
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type DuplicateApplicationInput = z.infer<
  typeof duplicateApplicationSchema
>;
export type MoveApplicationInput = z.infer<typeof moveApplicationSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
export type SearchApplicationsQuery = z.infer<
  typeof searchApplicationsQuerySchema
>;
