/**
 * Job Validators
 *
 * Zod schemas for job-related API endpoints.
 */

import { z } from "zod";

export const jobStatusSchema = z.enum([
  "PENDING",
  "ACTIVE",
  "COMPLETE",
  "ERROR",
  "CANCELLED",
]);

export const jobTypeSchema = z.enum([
  "FILE_UPLOAD",
  "URL_CRAWL",
  "YOUTUBE_UPLOAD",
  "TIKTOK_UPLOAD",
  "INSTAGRAM_UPLOAD",
  "FACEBOOK_UPLOAD",
  "NOTION_UPLOAD",
  "GOOGLE_DRIVE_UPLOAD",
  "SHAREPOINT_ONEDRIVE_UPLOAD",
  "AUDIO_UPLOAD",
  "PODCAST_UPLOAD",
  "API_UPLOAD",
  "CHAT_BATCH",
  "VIDEO_GENERATION",
]);

export const listJobsQuerySchema = z.object({
  applicationId: z.string().uuid(),
  status: jobStatusSchema.optional(),
  jobType: jobTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
