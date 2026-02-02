/**
 * Organization Validation Schemas
 *
 * Zod schemas for organization-related request validation.
 */

import { z } from "zod";

/**
 * Schema for updating an organization
 */
export const updateOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).optional(),
  pictureUrl: z.string().url().nullable().optional(),
});

/**
 * Schema for updating whitelabel settings
 */
export const updateWhitelabelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  isGoogleAuthDisabled: z.boolean().optional(),
  isMicrosoftAuthDisabled: z.boolean().optional(),
  isLocalAuthDisabled: z.boolean().optional(),
  isBillingDisabled: z.boolean().optional(),
  isHelpCenterDisabled: z.boolean().optional(),
  smtpFromEmail: z.string().email().nullable().optional(),
  smtpFromName: z.string().max(100).nullable().optional(),
});

// Export types derived from schemas
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type UpdateWhitelabelInput = z.infer<typeof updateWhitelabelSchema>;
