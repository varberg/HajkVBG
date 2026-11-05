import { AiChatError } from "../../../utils/AiChatError.ts";
import { createAnthropicProvider } from "./anthropic.provider.ts";
import { createOpenAiProvider } from "./openai.provider.ts";
import type { ChatProvider } from "./types.ts";

const env = (name: string): string | undefined =>
  process.env[name]?.trim() || undefined;

const unavailable = (reason: string) =>
  new AiChatError("unavailable", 503, `AI chat is unavailable: ${reason}`);

/**
 * @summary Create the provider set with AI_PROVIDER. The vendor SDK is only
 * loaded here, so that an install with the chat turned off never loads it.
 * @throws {AiChatError} If the configuration is incomplete
 */
export async function createProvider(): Promise<ChatProvider> {
  const provider = env("AI_PROVIDER");
  const model = env("AI_MODEL");
  const effort = env("AI_REASONING_EFFORT");

  switch (provider) {
    case "anthropic": {
      const apiKey = env("ANTHROPIC_API_KEY");
      if (apiKey === undefined) {
        throw unavailable("ANTHROPIC_API_KEY isn't set.");
      }
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      return createAnthropicProvider({
        client: new Anthropic({ apiKey }),
        model,
        effort,
      });
    }
    case "openai": {
      const apiKey = env("OPENAI_API_KEY");
      if (apiKey === undefined) {
        throw unavailable("OPENAI_API_KEY isn't set.");
      }
      // No default, so that the code doesn't name a model that gets outdated
      if (model === undefined) {
        throw unavailable("AI_MODEL is required with AI_PROVIDER=openai.");
      }
      const { default: OpenAI } = await import("openai");
      return createOpenAiProvider({
        client: new OpenAI({ apiKey, baseURL: env("OPENAI_BASE_URL") }),
        model,
        effort,
      });
    }
    default:
      throw unavailable('AI_PROVIDER must be "anthropic" or "openai".');
  }
}
