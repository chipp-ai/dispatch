/**
 * Parameter types for custom action configuration
 */
export enum ParamType {
  STRING = "STRING",
  NUMBER = "NUMBER",
  BOOLEAN = "BOOLEAN",
  OBJECT = "OBJECT",
  ARRAY = "ARRAY",
}

export type ValueSource =
  | "STATIC"
  | "AI_GENERATED"
  | "SYSTEM_VARIABLE"
  | "VARIABLE";

/**
 * Parameter structure for custom actions
 * Compatible with CustomActionModal.svelte types
 */
export interface Parameter {
  id?: string;
  key: string;
  value: string;
  type: ParamType;
  isAIGenerated: boolean;
  isSystemVariable?: boolean;
  systemKey?: string;
  valueSource?: ValueSource;
  variableName?: string;
  aiDescription?: string;
  isRequired?: boolean;
  sampleValue?: string;
}

export type SupportedToolCallMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface ParsedCurlResult {
  method: SupportedToolCallMethod;
  url: string;
  headers: Parameter[];
  queryParams: Parameter[];
  bodyParams: Parameter[];
  pathParams: Parameter[];
}
