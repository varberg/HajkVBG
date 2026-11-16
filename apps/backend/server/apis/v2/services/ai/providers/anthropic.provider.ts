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

const DEFAULT_EFFORT = "low";

// Server-side fallback on refusals. Models without it reject the field.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

interface AnthropicProviderOptions {
  client: Anthropic;
  model: string;
  effort?: string;
  /** Turn on the server-side fallback. Only for models that have it. */
  fallback?: boolean;
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

/**
 * @summary Join consecutive user messages into one. A turn can end on tool
 * results, see ToolDefinition.endsTurn, so the next question follows them.
 */
export function joinUserMessages(
  messages: BetaMessageParam[]
): BetaMessageParam[] {
  const blocks = (
    content: BetaMessageParam["content"]
  ): BetaContentBlockParam[] =>
    typeof content === "string"
      ? [{ type: "text", text: content }]
      : ((content ?? []) as BetaContentBlockParam[]);

  return messages.reduce<BetaMessageParam[]>((joined, message) => {
    const last = joined.at(-1);
    if (last?.role === "user" && message.role === "user") {
      joined[joined.length - 1] = {
        role: "user",
        content: [...blocks(last.content), ...blocks(message.content)],
      };
    } else {
      joined.push(message);
    }
    return joined;
  }, []);
}

class AnthropicSession implements ProviderSession {
  #client: Anthropic;
  #model: string;
  #effort: string;
  #fallback: boolean;
  #system: string;
  #tools: BetaTool[];
  #history = new SessionHistory<BetaMessageParam>();

  constructor(
    { client, model, effort, fallback }: AnthropicProviderOptions,
    system: string,
    tools: ProviderTool[]
  ) {
    this.#client = client;
    this.#model = model;
    this.#effort = effort ?? DEFAULT_EFFORT;
    this.#fallback = fallback === true;
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
        messages: joinUserMessages(this.#history.items),
        ...(this.#fallback && {
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
  id: `anthropic:${options.model}`,
  createSession: ({ system, tools }) =>
    new AnthropicSession(options, system, tools),
});
