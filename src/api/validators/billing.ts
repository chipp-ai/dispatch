/**
 * Billing Validation Schemas
 *
 * Zod schemas for billing-related request validation.
 */

import { z } from "zod";

/**
 * Schema for creating a billing portal session
 */
export const createPortalSessionSchema = z.object({
  returnUrl: z.string().url("Invalid return URL"),
});

/**
 * Schema for usage query parameters
 */
export const usageQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  groupBy: z.enum(["day", "week", "month"]).optional().default("day"),
});

// Export types derived from schemas
export type CreatePortalSessionInput = z.infer<
  typeof createPortalSessionSchema
>;
export type UsageQueryInput = z.infer<typeof usageQuerySchema>;
