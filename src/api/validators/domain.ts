/**
 * Domain Validation Schemas
 *
 * Zod schemas for custom domain-related request validation.
 */

import { z } from "zod";

/**
 * Hostname validation - must be a valid domain name
 */
const hostnameSchema = z
  .string()
  .min(1, "Hostname is required")
  .max(255, "Hostname too long")
  .regex(
    /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    "Invalid hostname format"
  );

/**
 * Domain type enum
 */
const domainTypeSchema = z.enum(["chat", "dashboard", "api"]);

/**
 * Schema for registering a new custom domain
 */
export const registerDomainSchema = z.object({
  hostname: hostnameSchema,
  type: domainTypeSchema,
  appId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
});

/**
 * Schema for internal domain lookup (from Cloudflare Worker)
 */
export const domainLookupSchema = z.object({
  hostname: hostnameSchema,
});

/**
 * Schema for updating domain settings
 */
export const updateDomainSchema = z.object({
  brandStyles: z
    .object({
      primaryColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .optional(),
      logoUrl: z.string().url().optional(),
      faviconUrl: z.string().url().optional(),
      companyName: z.string().max(100).optional(),
    })
    .optional(),
});

// Export types derived from schemas
export type RegisterDomainInput = z.infer<typeof registerDomainSchema>;
export type DomainLookupInput = z.infer<typeof domainLookupSchema>;
export type UpdateDomainInput = z.infer<typeof updateDomainSchema>;
