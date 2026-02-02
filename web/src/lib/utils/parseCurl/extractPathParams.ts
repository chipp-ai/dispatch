import buildParameter from "./buildParameter";
import type { Parameter } from "./types";

/**
 * Extract `{{variable}}` placeholders from a path and convert them into Parameter objects.
 */
export default function extractPathParams(path: string): Parameter[] {
  const params: Parameter[] = [];
  // Match both {{variable}} and {{namespace.variable}} patterns
  const matches = path.matchAll(
    /{{\s*(?:(var|system)\.)?([a-zA-Z0-9_]+)\s*}}/g
  );
  const seen = new Set<string>();

  for (const match of matches) {
    const namespace = match[1]; // 'var' or 'system' or undefined
    const varName = match[2];
    const fullMatch = match[0];

    if (varName && !seen.has(fullMatch)) {
      seen.add(fullMatch);

      if (namespace === "var") {
        // User variable
        params.push(
          buildParameter({
            key: varName,
            rawValue: fullMatch,
          })
        );
      } else if (namespace === "system") {
        // System variable
        params.push(
          buildParameter({
            key: varName,
            rawValue: fullMatch,
          })
        );
      } else {
        // AI-generated placeholder
        params.push(
          buildParameter({
            key: varName,
            rawValue: "",
            isAIGenerated: true,
          })
        );
      }
    }
  }

  return params;
}
