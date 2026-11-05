import type { JsonSchema } from "../tools.ts";

// A cap per model call. Chat answers are short, so this only stops a runaway
// answer. On Claude it includes the thinking.
export const MAX_OUTPUT_TOKENS = 16_000;

export type StopReason = "end" | "tool_calls" | "max_tokens" | "refusal";

export interface Usage {
  /** All input tokens, including the ones served from the cache. */
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface ProviderTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  callId: string;
  content: string;
  isError: boolean;
}

export interface ModelTurn {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  usage: Usage;
}

export interface RunOptions {
  onTextDelta: (delta: string) => void;
  signal: AbortSignal;
}

/**
 * One conversation with a model. The history stays in the provider's native
 * format, because reasoning and tool call items must be replayed unchanged.
 */
export interface ProviderSession {
  addUserMessage(text: string): void;
  /** All the results of one model turn, in one message. */
  addToolResults(results: ToolResult[]): void;
  /** Stream one model turn, and add its output to the history. */
  run(options: RunOptions): Promise<ModelTurn>;
  /** Keep everything added so far. Call when a turn is complete. */
  commit(): void;
  /** Drop everything added since the last commit. */
  rollback(): void;
}

export interface ChatProvider {
  /** Provider and model, for logs. */
  readonly id: string;
  createSession(options: {
    system: string;
    tools: ProviderTool[];
  }): ProviderSession;
}

/**
 * @summary An append-only history that can only go back to its last commit. An
 * interrupted turn is dropped as a whole, so a tool call never stays in the
 * history without its result.
 */
export class SessionHistory<T> {
  #items: T[] = [];
  #committed = 0;

  get items(): T[] {
    return this.#items;
  }

  push(...items: T[]): void {
    this.#items.push(...items);
  }

  commit(): void {
    this.#committed = this.#items.length;
  }

  rollback(): void {
    this.#items.length = this.#committed;
  }
}
