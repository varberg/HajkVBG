import type Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaOutputConfig,
  BetaTool,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { MAX_OUTPUT_TOKENS, SessionHistory } from "./types.ts";
import type {
  ChatProvider,
  ModelTurn,
  ProviderSession,
  ProviderTool,
  RunOptions,
  StopReason,
  ToolCall,
  ToolResult,
} from "./types.ts";

export const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_EFFORT = "low";

// Server-side fallback on refusals. Models outside this list reject the field.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MODELS_WITH_FALLBACK = [
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-1",
];

interface AnthropicProviderOptions {
  client: Anthropic;
  model?: string;
  effort?: string;
}

// `eager_input_streaming` stays off: it turns off the server's validation that
// `strict` gives, and these inputs are too small to gain from it.
const toTool = (tool: ProviderTool): BetaTool => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema as unknown as BetaTool["input_schema"],
  strict: true,
});

function stopReasonOf(message: BetaMessage, calls: ToolCall[]): StopReason {
  switch (message.stop_reason) {
    case "refusal":
      return "refusal";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "max_tokens";
    default:
      return calls.length > 0 ? "tool_calls" : "end";
  }
}

class AnthropicSession implements ProviderSession {
  #client: Anthropic;
  #model: string;
  #effort: string;
  #system: string;
  #tools: BetaTool[];
  #history = new SessionHistory<BetaMessageParam>();

  constructor(
    { client, model, effort }: AnthropicProviderOptions,
    system: string,
    tools: ProviderTool[]
  ) {
    this.#client = client;
    this.#model = model ?? DEFAULT_MODEL;
    this.#effort = effort ?? DEFAULT_EFFORT;
    this.#system = system;
    this.#tools = tools.map(toTool);
  }

  addUserMessage(text: string): void {
    this.#history.push({ role: "user", content: text });
  }

  addToolResults(results: ToolResult[]): void {
    this.#history.push({
      role: "user",
      content: results.map(({ callId, content, isError }) => ({
        type: "tool_result",
        tool_use_id: callId,
        content,
        is_error: isError,
      })),
    });
  }

  async run({ onTextDelta, signal }: RunOptions): Promise<ModelTurn> {
    const hasFallback = MODELS_WITH_FALLBACK.includes(this.#model);
    const stream = this.#client.beta.messages.stream(
      {
        model: this.#model,
        max_tokens: MAX_OUTPUT_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: this.#effort as BetaOutputConfig["effort"] },
        // Tools render before the system prompt, so this covers both, while the
        // top-level marker follows the end of the conversation.
        system: [
          {
            type: "text",
            text: this.#system,
            cache_control: { type: "ephemeral" },
          },
        ],
        cache_control: { type: "ephemeral" },
        tools: this.#tools,
        messages: this.#history.items,
        ...(hasFallback && {
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        }),
      },
      { signal }
    );
    stream.on("text", (delta) => onTextDelta(delta));

    const message = await stream.finalMessage();

    // Everything goes back unchanged, thinking blocks included
    this.#history.push({
      role: "assistant",
      content: message.content as BetaContentBlockParam[],
    });

    const toolCalls: ToolCall[] = message.content.flatMap((block) =>
      block.type === "tool_use"
        ? [{ id: block.id, name: block.name, input: block.input }]
        : []
    );
    const { usage } = message;
    const cachedTokens = usage.cache_read_input_tokens ?? 0;

    return {
      text: message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join(""),
      toolCalls,
      stopReason: stopReasonOf(message, toolCalls),
      usage: {
        inputTokens:
          usage.input_tokens +
          cachedTokens +
          (usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.output_tokens,
        cachedTokens,
      },
    };
  }

  commit(): void {
    this.#history.commit();
  }

  rollback(): void {
    this.#history.rollback();
  }
}

export const createAnthropicProvider = (
  options: AnthropicProviderOptions
): ChatProvider => ({
  id: `anthropic:${options.model ?? DEFAULT_MODEL}`,
  createSession: ({ system, tools }) =>
    new AnthropicSession(options, system, tools),
});
