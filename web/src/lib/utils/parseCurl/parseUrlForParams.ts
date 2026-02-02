import buildParameter from "./buildParameter";
import extractPathParams from "./extractPathParams";
import type { Parameter } from "./types";

/**
 * Parse query and path parameters from a URL-like token. Falls back to a manual
 * parser when the standard URL constructor rejects the input (e.g. because of
 * template placeholders).
 */
export default function parseUrlForParams(token: string): {
  queryParams: Parameter[];
  pathParams: Parameter[];
} {
  const queryParams: Parameter[] = [];
  const pathParams: Parameter[] = [];

  try {
    const urlObj = new URL(token);

    // --- Query params ------------------------------------------------------
    urlObj.searchParams.forEach((value, key) => {
      queryParams.push(
        buildParameter({
          key,
          rawValue: value,
        })
      );
    });

    // --- Path params -------------------------------------------------------
    const decodedPath = decodeURIComponent(urlObj.pathname);
    pathParams.push(...extractPathParams(decodedPath));
  } catch {
    /* ----------------------------------------------------------------------
     * Fallback parsing when the native URL constructor fails. This typically
     * happens when the URL contains template placeholders like `{{userId}}`.
     * -------------------------------------------------------------------- */

    // Split on "?" so we can process query params separately.
    const [pathPart, queryString] = token.split("?");

    // --- Query params ----------------------------------------------------
    if (queryString) {
      const pairs = queryString.split("&");
      for (const pair of pairs) {
        if (!pair) continue;
        const [rawKey, rawVal = ""] = pair.split("=");
        const key = decodeURIComponent(rawKey);
        const value = decodeURIComponent(rawVal);
        queryParams.push(
          buildParameter({
            key,
            rawValue: value,
          })
        );
      }
    }

    // --- Path params -----------------------------------------------------
    pathParams.push(...extractPathParams(pathPart));
  }

  return { queryParams, pathParams };
}
