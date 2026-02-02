/**
 * Builder Component Types
 *
 * Shared types for builder components.
 */

// Application Variables
export type VariableType = "string" | "number" | "boolean" | "secret" | "url";

export interface ApplicationVariable {
  id: string;
  applicationId: string;
  name: string;
  label: string;
  type: VariableType;
  description?: string;
  required: boolean;
  placeholder?: string;
  value?: string;
}

// Custom Actions
export type Parameter = {
  id: string;
  key: string;
  value: string;
  isAIGenerated: boolean;
  aiDescription?: string;
};

export type CustomAction = {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Parameter[];
  queryParams?: Parameter[];
  bodyParams?: Parameter[];
  pathParams?: Parameter[];
};
