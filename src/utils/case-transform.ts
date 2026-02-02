/**
 * Case Transformation Utilities
 *
 * Converts between snake_case (database) and camelCase (frontend).
 */

/**
 * Convert a snake_case string to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Transform an object's keys from snake_case to camelCase (shallow)
 */
export function toCamelCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[snakeToCamel(key)] = obj[key];
  }
  return result;
}

/**
 * Transform an object's keys from snake_case to camelCase (deep)
 * Handles nested objects and arrays
 */
export function toCamelCaseDeep<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCaseDeep(item)) as T;
  }

  if (typeof obj === "object" && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as object)) {
      const value = (obj as Record<string, unknown>)[key];
      result[snakeToCamel(key)] = toCamelCaseDeep(value);
    }
    return result as T;
  }

  return obj;
}
