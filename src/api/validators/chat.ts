/**
 * Chat Validation Schemas
 *
 * Zod schemas for chat request validation.
 */

import { z } from "zod";

export const chatSessionSourceSchema = z.enum([
  "APP",
  "API",
  "WHATSAPP",
  "SLACK",
  "EMAIL",
]);

export const senderTypeSchema = z.enum(["USER", "BOT"]);

export const createSessionSchema = z.object({
  title: z.string().max(255).optional(),
  source: chatSessionSourceSchema.default("APP"),
});

export const listSessionsQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(), // Legacy cursor support

  // Filters
  source: chatSessionSourceSchema.optional(),
  search: z.string().max(200).optional(),
  status: z.enum(["all", "unread"]).default("all"),
  tag: z.string().uuid().optional(), // Filter by tag ID
  phoneNumber: z.string().max(50).optional(), // Filter WhatsApp sessions by phone
});

export const audioInputSchema = z.object({
  data: z.string().min(1).max(10_000_000),
  mimeType: z.string().regex(/^audio\/(webm|wav|mp3|mp4|ogg|mpeg)(;.*)?$/),
  durationMs: z.number().int().min(0).max(300_000).optional(),
});

export const videoInputSchema = z.object({
  url: z.string().url().max(2000),
  mimeType: z.string().regex(/^video\/(mp4|webm|quicktime|x-msvideo|mpeg)$/),
});

export const streamChatSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    message: z.string().max(100000),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    audio: audioInputSchema.optional(),
    video: videoInputSchema.optional(),
  })
  .refine(
    (data) => data.message.trim().length > 0 || data.audio || data.video,
    {
      message: "Either message, audio, or video is required",
      path: ["message"],
    }
  );

// Export types
export type ChatSessionSource = z.infer<typeof chatSessionSourceSchema>;
export type SenderType = z.infer<typeof senderTypeSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export type StreamChatInput = z.infer<typeof streamChatSchema>;
