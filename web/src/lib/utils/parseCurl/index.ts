import type {
  SupportedToolCallMethod,
  Parameter,
  ParsedCurlResult,
} from "./types";
import stripQuotes from "./stripQuotes";
import parseBodyData from "./parseBodyData";
import parseUrlForParams from "./parseUrlForParams";
import buildParameter from "./buildParameter";

export type { Parameter, ParsedCurlResult, SupportedToolCallMethod };
export { buildParameter };

// Valid HTTP methods
const VALID_METHODS = new Set<SupportedToolCallMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function isValidMethod(method: string): method is SupportedToolCallMethod {
  return VALID_METHODS.has(method.toUpperCase() as SupportedToolCallMethod);
}

// Helper to ensure at least one empty param exists for UI consistency
const ensureDefaultRow = (arr: Parameter[]) => {
  if (arr.length === 0) {
    arr.push(
      buildParameter({
        key: "",
        rawValue: "",
      })
    );
  }
};

/**
 * Parse a cURL command string and extract structured API configuration
 */
export default function parseCurl(curlCommand: string): ParsedCurlResult {
  // Default structure to return in case of any errors / empty input
  const result: ParsedCurlResult = {
    method: "GET",
    url: "",
    headers: [],
    queryParams: [],
    bodyParams: [],
    pathParams: [],
  };

  if (!curlCommand) {
    // For empty commands, we still need to ensure default rows
    ensureDefaultRow(result.headers);
    ensureDefaultRow(result.queryParams);
    ensureDefaultRow(result.bodyParams);
    ensureDefaultRow(result.pathParams);
    return result;
  }

  // Tokenize the curl command while respecting quotes
  const tokenRegex = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g;
  const rawTokens = curlCommand.match(tokenRegex);
  if (!rawTokens) return result;

  const tokens = rawTokens.map(stripQuotes);

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === "curl") {
      i++;
      continue;
    }

    switch (token) {
      case "-X":
      case "--request": {
        const next = tokens[i + 1];
        if (next) {
          const upperMethod = next.toUpperCase();
          result.method = isValidMethod(upperMethod) ? upperMethod : "GET";
          i += 2;
        } else {
          i++;
        }
        break;
      }
      case "-H":
      case "--header": {
        const headerToken = tokens[i + 1];
        if (headerToken) {
          const headerStr = headerToken;
          const colonIdx = headerStr.indexOf(":");
          if (colonIdx > -1) {
            const headerKey = headerStr.slice(0, colonIdx).trim();
            const headerValue = headerStr.slice(colonIdx + 1).trim();
            result.headers.push(
              buildParameter({
                key: headerKey,
                rawValue: headerValue,
              })
            );
          }
          i += 2;
        } else {
          i++;
        }
        break;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary": {
        const dataToken = tokens[i + 1];
        if (dataToken) {
          result.bodyParams.push(...parseBodyData(dataToken));
          i += 2;
        } else {
          i++;
        }
        break;
      }
      case "-u":
      case "--user": {
        const authToken = tokens[i + 1];
        if (authToken) {
          // Convert user:pass to Basic auth header
          // Use btoa for browser compatibility
          const authHeader = `Basic ${btoa(authToken)}`;
          result.headers.push(
            buildParameter({
              key: "Authorization",
              rawValue: authHeader,
            })
          );
          i += 2;
        } else {
          i++;
        }
        break;
      }
      default: {
        if (token.startsWith("-")) {
          // Unknown flag - check if it might have a value
          const nextToken = tokens[i + 1];
          if (
            nextToken &&
            !nextToken.startsWith("-") &&
            !nextToken.startsWith("http")
          ) {
            // Skip both flag and its value
            i += 2;
          } else {
            // Just skip the flag
            i++;
          }
        } else {
          // Non-flag token - if no URL yet, this might be it
          if (!result.url) {
            result.url = token;
            const { queryParams, pathParams } = parseUrlForParams(token);
            result.queryParams.push(...queryParams);
            result.pathParams.push(...pathParams);
          }
          i++;
        }
        break;
      }
    }
  }

  // If METHOD wasn't explicitly provided and body data exists assume POST
  if (result.method === "GET" && result.bodyParams.length > 0) {
    result.method = "POST";
  }

  // Ensure at least one empty param exists for UI consistency
  ensureDefaultRow(result.headers);
  ensureDefaultRow(result.queryParams);
  ensureDefaultRow(result.bodyParams);
  ensureDefaultRow(result.pathParams);

  return result;
}
