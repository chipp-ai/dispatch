import { ParamType, type Parameter } from "./types";
import {
  TEMPLATE_VAR_REGEX,
  SYSTEM_VAR_REGEX,
  SUPPORTED_SYSTEM_KEYS,
} from "./constants";
import getParamType from "./getParamType";

export default function buildParameter({
  key,
  rawValue,
  isAIGenerated: isAIGeneratedInput,
}: {
  key: string;
  rawValue: unknown;
  isAIGenerated?: boolean;
}): Parameter {
  // Check if the entire value is a variable (not just contains one)
  const valueStr = typeof rawValue === "string" ? rawValue.trim() : "";

  let isSystemVariable = !!(
    valueStr && valueStr.match(/^{{\s*system\.([a-zA-Z0-9_]+)\s*}}$/)
  );

  let isUserVariable = !!(
    valueStr && valueStr.match(/^{{\s*var\.([a-zA-Z0-9_]+)\s*}}$/)
  );

  // Heuristic: if the key is "messages" and the value looks like an array of
  // chat messages ({ role, content }), treat it as the built-in
  // system.message_history variable so that users can paste a fully-formed
  // cURL without the placeholder and we'll still infer the intent.
  let systemKey: string | undefined;
  if (!isSystemVariable && Array.isArray(rawValue) && key === "messages") {
    const looksLikeChatHistory = rawValue.every((item) => {
      return (
        item && typeof item === "object" && "role" in item && "content" in item
      );
    });
    if (looksLikeChatHistory) {
      isSystemVariable = true;
      systemKey = "message_history";
    }
  }

  // Ensure AI-generated flag is false when it's actually a system variable or user variable
  // If isAIGeneratedInput is explicitly passed, use it; otherwise check the value
  // Check if the value contains any template variables (not just if it's entirely a template variable)
  const containsTemplateVar =
    typeof rawValue === "string" && TEMPLATE_VAR_REGEX.test(rawValue);
  const isAIGenerated =
    !isSystemVariable &&
    !isUserVariable &&
    (isAIGeneratedInput !== undefined
      ? isAIGeneratedInput
      : containsTemplateVar);

  const systemKeyMatch =
    isSystemVariable && typeof rawValue === "string"
      ? (rawValue as string).match(SYSTEM_VAR_REGEX)
      : null;
  if (!systemKey && systemKeyMatch) {
    systemKey = systemKeyMatch[1];
  }

  // Bail out if the captured key is not recognised – treat value as manual.
  if (
    isSystemVariable &&
    (!systemKey || !SUPPORTED_SYSTEM_KEYS.has(systemKey))
  ) {
    isSystemVariable = false;
    systemKey = undefined;
  }

  // Extract user variable name
  let variableName: string | undefined;
  if (isUserVariable) {
    const match = valueStr.match(/^{{\s*var\.([a-zA-Z0-9_]+)\s*}}$/);
    if (match) {
      variableName = match[1];
    }
  }

  // Param type – if system var is message_history we know it's an ARRAY at
  // runtime, otherwise default to STRING. User variables default to STRING.
  const paramType = isSystemVariable
    ? systemKey === "message_history"
      ? ParamType.ARRAY
      : ParamType.STRING
    : isUserVariable
      ? ParamType.STRING
      : getParamType(rawValue);

  // Convert non-primitive types to JSON string for value / sampleValue fields
  const serialized =
    paramType === ParamType.OBJECT || paramType === ParamType.ARRAY
      ? JSON.stringify(rawValue)
      : String(rawValue);

  return {
    id: crypto.randomUUID(),
    key,
    value:
      isAIGenerated || isSystemVariable || isUserVariable ? "" : serialized,
    type: paramType,
    isAIGenerated,
    isSystemVariable,
    systemKey,
    valueSource: isUserVariable
      ? "VARIABLE"
      : isSystemVariable
        ? "SYSTEM_VARIABLE"
        : isAIGenerated
          ? "AI_GENERATED"
          : "STATIC",
    variableName,
    aiDescription: "",
    isRequired: true,
    sampleValue:
      isAIGenerated || isSystemVariable || isUserVariable ? "" : serialized,
  };
}
