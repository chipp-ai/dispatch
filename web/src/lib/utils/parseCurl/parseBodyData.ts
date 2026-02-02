import buildParameter from "./buildParameter";
import type { Parameter } from "./types";
import { TEMPLATE_VAR_REGEX } from "./constants";

// Helper function to check if a value is a template variable
function isTemplateVar(value: unknown): boolean {
  return typeof value === "string" && TEMPLATE_VAR_REGEX.test(value);
}

// Check if a string is entirely a template variable (not just contains one)
function isPureTemplateVar(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.match(/^{{[^}]+}}$/) !== null;
}

// Recursively flatten nested objects into path-based parameters
function flattenObject(
  obj: Record<string, unknown>,
  prefix: string,
  params: Parameter[]
): void {
  Object.entries(obj).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value === null) {
      // Handle null values
      params.push(
        buildParameter({
          key: path,
          rawValue: "null",
          isAIGenerated: false,
        })
      );
    } else if (
      typeof value === "object" &&
      !isTemplateVar(value) &&
      !Array.isArray(value)
    ) {
      // Handle nested objects - check if it's empty
      if (Object.keys(value as object).length === 0) {
        params.push(
          buildParameter({
            key: path,
            rawValue: {},
            isAIGenerated: false,
          })
        );
      } else {
        // Recursively process nested object
        flattenObject(value as Record<string, unknown>, path, params);
      }
    } else if (Array.isArray(value)) {
      // Special case: Check if this is a messages array that should be treated as system.message_history
      if (key === "messages" && value.length > 0) {
        const looksLikeChatHistory = value.every((item) => {
          return (
            item &&
            typeof item === "object" &&
            "role" in item &&
            "content" in item
          );
        });
        if (looksLikeChatHistory) {
          // Don't flatten - pass the whole array to buildParameter
          params.push(
            buildParameter({
              key: path,
              rawValue: value,
              isAIGenerated: false,
            })
          );
          return;
        }
      }

      // Handle arrays normally
      if (value.length === 0) {
        params.push(
          buildParameter({
            key: path,
            rawValue: [],
            isAIGenerated: false,
          })
        );
      } else {
        value.forEach((item, index) => {
          const arrayPath = `${path}[${index}]`;
          if (
            typeof item === "object" &&
            item !== null &&
            !isTemplateVar(item)
          ) {
            flattenObject(item as Record<string, unknown>, arrayPath, params);
          } else {
            params.push(
              buildParameter({
                key: arrayPath,
                rawValue: item,
                isAIGenerated: isPureTemplateVar(item),
              })
            );
          }
        });
      }
    } else {
      // Handle primitive values and template variables
      params.push(
        buildParameter({
          key: path,
          rawValue: value,
          isAIGenerated: isPureTemplateVar(value),
        })
      );
    }
  });
}

/**
 * Parse the body (-d/--data...) section and return the derived parameters.
 */
export default function parseBodyData(dataStr: string): Parameter[] {
  const params: Parameter[] = [];

  let parsed: Record<string, unknown> | unknown[] | null = null;
  try {
    parsed = JSON.parse(dataStr);
  } catch {
    // If direct parse fails, try sanitising unquoted placeholders
    const safeForJson = dataStr.replace(/({{\s*[^{}]+\s*}})/g, '"$1"');
    try {
      parsed = JSON.parse(safeForJson);
    } catch {
      // Still failed, will handle below
    }
  }

  if (parsed !== null) {
    // Handle top-level arrays
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        // Empty array - treat as single data param
        params.push(
          buildParameter({
            key: "data",
            rawValue: dataStr,
            isAIGenerated: false,
          })
        );
      } else {
        // Non-empty array - flatten it
        parsed.forEach((item, index) => {
          if (
            typeof item === "object" &&
            item !== null &&
            !isTemplateVar(item)
          ) {
            flattenObject(
              item as Record<string, unknown>,
              `[${index}]`,
              params
            );
          } else {
            params.push(
              buildParameter({
                key: `[${index}]`,
                rawValue: item,
                isAIGenerated: isPureTemplateVar(item),
              })
            );
          }
        });
      }
    } else if (typeof parsed === "object") {
      // Regular object - use the flattening logic
      flattenObject(parsed as Record<string, unknown>, "", params);
    } else {
      // Primitive value at top level
      params.push(
        buildParameter({
          key: "data",
          rawValue: parsed,
          isAIGenerated: isPureTemplateVar(parsed),
        })
      );
    }
    return params;
  }

  // If we reach here parsing failed
  // Not valid JSON; treat entire data as single body param named "data"
  console.warn("Failed to parse JSON body data in cURL command", {
    data: dataStr,
  });

  const isAIGenerated = TEMPLATE_VAR_REGEX.test(dataStr);
  params.push(
    buildParameter({
      key: "data",
      rawValue: dataStr,
      isAIGenerated,
    })
  );

  return params;
}
