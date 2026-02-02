/**
 * Provider Decoders Index
 *
 * Exports all provider-specific decoders for converting provider responses
 * to unified format.
 */

export { OpenAIDecoder, openaiDecoder, OpenAIStreamTracker } from "./openai.ts";
export {
  AnthropicDecoder,
  anthropicDecoder,
  AnthropicStreamTracker,
} from "./anthropic.ts";
export { GoogleDecoder, googleDecoder, GoogleStreamTracker } from "./google.ts";

import type { ProviderFamily } from "../types.ts";
import { openaiDecoder, OpenAIDecoder } from "./openai.ts";
import { anthropicDecoder, AnthropicDecoder } from "./anthropic.ts";
import { googleDecoder, GoogleDecoder } from "./google.ts";

/**
 * Get the default decoder for a provider family
 */
export function getDecoder(
  provider: ProviderFamily
): OpenAIDecoder | AnthropicDecoder | GoogleDecoder {
  switch (provider) {
    case "openai":
      return openaiDecoder;
    case "anthropic":
      return anthropicDecoder;
    case "google":
      return googleDecoder;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
