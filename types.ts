/**
 * Shared Types
 *
 * Type definitions used across the application.
 */

import type { Context } from "hono";

// ============================================================
// User Types
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  picture?: string | null;
  organizationId: string;
  role: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at?: Date;
}

export interface ApiCredential {
  id: string;
  developerId: string;
  applicationId: string | null;
  scopes: unknown;
}

export interface AppInfo {
  id: string;
  name: string;
  developerId: string;
}

// ============================================================
// Hono Context Variables
// ============================================================

export interface AppVariables {
  requestId: string;
  user: AuthUser;
  session: Session;
  apiCredential: ApiCredential;
  app: AppInfo;
  tenant: unknown | null;
}

export type AppEnv = { Variables: Partial<AppVariables> };
