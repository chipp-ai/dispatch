import { ParamType } from "./types";

/**
 * Determine the correct ParamType for a given JS value
 */
export default function getParamType(val: unknown): ParamType {
  if (Array.isArray(val)) return ParamType.ARRAY;
  if (val === null) return ParamType.STRING; // treat null as string for now
  switch (typeof val) {
    case "number":
      return ParamType.NUMBER;
    case "boolean":
      return ParamType.BOOLEAN;
    case "object":
      return ParamType.OBJECT;
    default:
      return ParamType.STRING;
  }
}
