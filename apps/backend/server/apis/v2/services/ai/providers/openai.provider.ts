import type OpenAI from "openai";
import type {
  FunctionTool,
  Response,
  ResponseCreateParamsStreaming,
  ResponseInputItem,
  ResponseOutputItem,
} from "openai/resources/responses/responses";

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

interface OpenAiProviderOptions {
  client: OpenAI;
  model: string;
  /** Sent as it is, because the accepted values differ per model. */
  effort?: string;
}

const toTool = (tool: ProviderTool): FunctionTool => ({
  type: "function",
  name: tool.name,
  description: tool.description,
  parameters: tool.inputSchema as unknown as Record<string, unknown>,
  strict: true,
});

// A broken string goes on as it is, and fails the tool's input validation
function parseArguments(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toolCallsOf(output: ResponseOutputItem[]): ToolCall[] {
  return output.flatMap((item) =>
    item.type === "function_call"
      ? [
          {
            id: item.call_id,
            name: item.name,
            input: parseArguments(item.arguments),
          },
        ]
      : []
  );
}

function stopReasonOf(response: Response, calls: ToolCall[]): StopReason {
  const reason = response.incomplete_details?.reason;
  const refused = response.output.some(
    (item) =>
      item.type === "message" &&
      item.content.some((part) => part.type === "refusal")
  );
  if (refused || reason === "content_filter") return "refusal";
  if (response.status === "incomplete") return "max_tokens";
  return calls.length > 0 ? "tool_calls" : "end";
}

const textOf = (output: ResponseOutputItem[]): string =>
  output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .flatMap((part) => (part.type === "output_text" ? [part.text] : []))
    .join("");

class OpenAiSession implements ProviderSession {
  #options: OpenAiProviderOptions;
  #system: string;
  #tools: FunctionTool[];
  #history = new SessionHistory<ResponseInputItem>();

  constructor(
    options: OpenAiProviderOptions,
    system: string,
    tools: ProviderTool[]
  ) {
    this.#options = options;
    this.#system = system;
    this.#tools = tools.map(toTool);
  }

  addUserMessage(text: string): void {
    this.#history.push({ role: "user", content: text });
  }

  addToolResults(results: ToolResult[]): void {
    // Function outputs have no error flag, but the content says what went wrong
    this.#history.push(
      ...results.map(({ callId, content }): ResponseInputItem => ({
        type: "function_call_output",
        call_id: callId,
        output: content,
      }))
    );
  }

  async run({ onTextDelta, signal }: RunOptions): Promise<ModelTurn> {
    const { client, model, effort } = this.#options;
    const params: ResponseCreateParamsStreaming = {
      model,
      instructions: this.#system,
      input: this.#history.items,
      tools: this.#tools,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      // The history lives here, so nothing needs to be kept at OpenAI. Reasoning
      // can then only be replayed in its encrypted form, which must be asked for.
      store: false,
      include: ["reasoning.encrypted_content"],
      ...(effort !== undefined && {
        reasoning: { effort } as ResponseCreateParamsStreaming["reasoning"],
      }),
    };

    // Not responses.stream(), as its parsed items carry extra fields, and the
    // items must go back exactly as they were returned.
    const stream = await client.responses.create(params, { signal });

    let response: Response | null = null;
    for await (const event of stream) {
      switch (event.type) {
        case "response.output_text.delta":
          onTextDelta(event.delta);
          break;
        case "response.completed":
        case "response.incomplete":
          response = event.response;
          break;
        case "response.failed":
          throw new Error(
            event.response.error?.message ?? "The model response failed."
          );
        case "error":
          throw new Error(event.message);
      }
    }
    if (response === null) {
      throw new Error("The model response ended without a result.");
    }

    this.#history.push(...(response.output as ResponseInputItem[]));

    const toolCalls = toolCallsOf(response.output);
    const inputDetails = response.usage?.input_tokens_details;
    return {
      text: textOf(response.output),
      toolCalls,
      stopReason: stopReasonOf(response, toolCalls),
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cachedTokens: inputDetails?.cached_tokens ?? 0,
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

export const createOpenAiProvider = (
  options: OpenAiProviderOptions
): ChatProvider => ({
  id: `openai:${options.model}`,
  createSession: ({ system, tools }) =>
    new OpenAiSession(options, system, tools),
});
