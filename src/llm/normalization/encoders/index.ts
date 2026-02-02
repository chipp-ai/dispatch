/**
 * Provider Encoders Index
 *
 * Exports all provider-specific encoders for converting unified messages
 * to provider-specific formats.
 */

export { OpenAIEncoder, openaiEncoder } from "./openai.ts";
export type { OpenAIEncoderConfig } from "./openai.ts";

export { AnthropicEncoder, anthropicEncoder } from "./anthropic.ts";
export type { AnthropicEncoderConfig } from "./anthropic.ts";

export { GoogleEncoder, googleEncoder } from "./google.ts";
export type { GoogleEncoderConfig } from "./google.ts";

import type { ProviderFamily } from "../types.ts";
import { openaiEncoder, OpenAIEncoder } from "./openai.ts";
import { anthropicEncoder, AnthropicEncoder } from "./anthropic.ts";
import { googleEncoder, GoogleEncoder } from "./google.ts";

/**
 * Get the default encoder for a provider family
 */
export function getEncoder(
  provider: ProviderFamily
): OpenAIEncoder | AnthropicEncoder | GoogleEncoder {
  switch (provider) {
    case "openai":
      return openaiEncoder;
    case "anthropic":
      return anthropicEncoder;
    case "google":
      return googleEncoder;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
