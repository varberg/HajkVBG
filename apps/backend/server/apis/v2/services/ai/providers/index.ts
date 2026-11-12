import { AiChatError } from "../../../utils/AiChatError.ts";
import { DEFAULT_ANTHROPIC_MODEL, readProviderConfig } from "../config.ts";
import type { ProviderConfig } from "../config.ts";
import { createAnthropicProvider } from "./anthropic.provider.ts";
import { createOpenAiProvider } from "./openai.provider.ts";
import type { ChatProvider } from "./types.ts";

const unavailable = (reason: string) =>
  new AiChatError("unavailable", 503, `AI chat is unavailable: ${reason}`);

/**
 * @summary Create the provider set with AI_PROVIDER. The vendor SDK is only
 * loaded here, so that an install with the chat turned off never loads it.
 * @throws {AiChatError} If the configuration is incomplete
 */
export async function createProvider(
  config: ProviderConfig = readProviderConfig()
): Promise<ChatProvider> {
  const { provider, model, effort } = config;

  switch (provider) {
    case "anthropic": {
      const apiKey = config.anthropicApiKey;
      if (apiKey === undefined) {
        throw unavailable("ANTHROPIC_API_KEY isn't set.");
      }
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      return createAnthropicProvider({
        client: new Anthropic({ apiKey }),
        model: model ?? DEFAULT_ANTHROPIC_MODEL,
        effort,
        fallback: config.fallback,
      });
    }
    case "openai": {
      const apiKey = config.openAiApiKey;
      if (apiKey === undefined) {
        throw unavailable("OPENAI_API_KEY isn't set.");
      }
      // No default, so that the code doesn't name a model that gets outdated
      if (model === undefined) {
        throw unavailable("AI_MODEL is required with AI_PROVIDER=openai.");
      }
      const { default: OpenAI } = await import("openai");
      return createOpenAiProvider({
        client: new OpenAI({ apiKey, baseURL: config.openAiBaseUrl }),
        model,
        effort,
      });
    }
    default:
      throw unavailable('AI_PROVIDER must be "anthropic" or "openai".');
  }
}
