/**
 * ID Generation Utilities
 *
 * Generates unique identifiers for database records.
 */

/**
 * Generate a UUID v4 string
 * Uses Deno's built-in crypto.randomUUID()
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a prefixed ID (e.g., "app_xxxxx")
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${generateId().replace(/-/g, "")}`;
}

/**
 * Generate a short ID (first 8 chars of UUID)
 * Use when full UUID is not needed
 */
export function generateShortId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}
