import log4js from "log4js";

import { AiChatError } from "../../utils/AiChatError.ts";
import type { UserCatalog } from "./access.service.ts";
import type { ChatLimits } from "./config.ts";
import { ConversationStore, DailyTurnCounter } from "./conversations.ts";
import type { Conversation } from "./conversations.ts";
import { renderMapState, sanitizeMapState } from "./mapState.ts";
import { buildSystemPrompt, buildUserMessage } from "./prompt.ts";
import type {
  ChatProvider,
  ToolCall,
  ToolResult,
  Usage,
} from "./providers/types.ts";
import type {
  ToolContext,
  ToolDefinition,
  ToolEvent,
  ToolRun,
} from "./tools.ts";

const logger = log4js.getLogger("service.ai.chat");

// Long enough for any real conversation, and it keeps the memory of each one
// bounded even when AI_MAX_CONVERSATIONS is 0.
const MAX_TURNS_PER_CONVERSATION = 30;

export type TurnErrorCode =
  | "refusal"
  | "max_tokens"
  | "max_iterations"
  | "token_budget"
  | "timeout"
  | "model_error";

export type ChatEvent =
  | { type: "start"; conversationId: string }
  | { type: "text"; delta: string }
  | {
      type: "tool_status";
      tool: string;
      status: "running" | "done" | "failed";
    }
  | ToolEvent
  | { type: "done"; truncated: boolean }
  | { type: "error"; code: TurnErrorCode; message: string };

export type Emit = (event: ChatEvent) => void;

export interface ToolRegistry {
  tools: ToolDefinition[];
  run(name: string, input: unknown, context: ToolContext): Promise<ToolRun>;
}

interface OrchestratorOptions {
  provider: ChatProvider;
  access: { getUserCatalog(map: string, user?: string): Promise<UserCatalog> };
  search: ToolContext["search"];
  wfs: ToolContext["wfs"];
  registry: ToolRegistry;
  limits: ChatLimits;
  /** The added instructions from App_Data/ai. Without it, there are none. */
  instructions?: { getInstructions(map: string): Promise<string | null> };
  now?: () => number;
}

const noInstructions: NonNullable<OrchestratorOptions["instructions"]> = {
  getInstructions: async () => null,
};

export interface TurnRequest {
  map: string;
  user: string | undefined;
  conversationId: string | null;
  message: string;
  mapState: unknown;
}

/** A turn that has passed all checks, and holds its conversation. */
export interface Turn {
  conversation: Conversation;
  userCatalog: UserCatalog;
  message: string;
  mapState: unknown;
}

const MESSAGES: Record<TurnErrorCode, string> = {
  refusal: "The model declined to answer.",
  max_tokens: "The answer got too long.",
  max_iterations: "The question took too many steps.",
  token_budget: "The question used up its budget.",
  timeout: "The answer took too long.",
  model_error: "The model couldn't be reached.",
};

class TurnStop extends Error {
  code: TurnErrorCode;

  constructor(code: TurnErrorCode) {
    super(MESSAGES[code]);
    this.code = code;
  }
}

/**
 * @summary Settle with `work`, or reject as soon as the signal aborts. `work` is
 * always handled, also when the signal has already aborted: a rejection nobody
 * handles would take down the whole backend.
 */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) {
      abort();
    }
  });
}

/**
 * @summary Runs the single agent loop of the chat.
 * @description It knows nothing about HTTP, as everything it has to say goes out
 * through `emit`. It knows nothing about vendors either, only the provider
 * interface, and it knows tools only by their `kind`.
 */
export class Orchestrator {
  #provider: ChatProvider;
  #access: OrchestratorOptions["access"];
  #search: ToolContext["search"];
  #wfs: ToolContext["wfs"];
  #registry: ToolRegistry;
  #limits: ChatLimits;
  #instructions: NonNullable<OrchestratorOptions["instructions"]>;
  #conversations: ConversationStore;
  #dailyTurns: DailyTurnCounter;

  constructor({
    provider,
    access,
    search,
    wfs,
    registry,
    limits,
    instructions,
    now,
  }: OrchestratorOptions) {
    this.#provider = provider;
    this.#access = access;
    this.#search = search;
    this.#wfs = wfs;
    this.#registry = registry;
    this.#limits = limits;
    this.#instructions = instructions ?? noInstructions;
    this.#conversations = new ConversationStore({
      maxConversations: limits.maxConversations,
      ttlMs: limits.conversationTtlMs,
      now,
    });
    this.#dailyTurns = new DailyTurnCounter(limits.dailyMaxTurns, now);
  }

  /**
   * @summary Check a request and reserve its conversation. This is separate from
   * runTurn so that the checks can end in a plain HTTP error. Whoever gets a
   * Turn from this must pass it on to runTurn, which releases it again.
   * @throws {AiChatError | AccessError} If the turn can't run
   */
  async beginTurn(request: TurnRequest): Promise<Turn> {
    const { map, user, conversationId, message, mapState } = request;
    // Access first: a user without it mustn't make us read anything else
    const userCatalog = await this.#access.getUserCatalog(map, user);
    // Only a new conversation uses them, but reading them is two stats
    const instructions = await this.#instructions.getInstructions(map);

    // Nothing below awaits, so two requests can't both pass the running check
    let conversation =
      conversationId === null
        ? null
        : this.#conversations.get(conversationId, userCatalog.map, user);

    if (conversation?.running) {
      throw new AiChatError(
        "turn_running",
        409,
        "The previous question is still being answered."
      );
    }
    if (
      conversation !== null &&
      conversation.turns >= MAX_TURNS_PER_CONVERSATION
    ) {
      this.#conversations.remove(conversation);
      throw new AiChatError(
        "conversation_lost",
        404,
        "The conversation has reached its maximum length. Start a new one."
      );
    }
    if (!this.#dailyTurns.tryConsume()) {
      throw new AiChatError(
        "daily_limit",
        429,
        "The chat has reached its limit for today. The map works as usual."
      );
    }

    conversation ??= this.#conversations.create(
      userCatalog.map,
      user,
      this.#provider.createSession({
        system: buildSystemPrompt(userCatalog, instructions),
        tools: this.#registry.tools.map(
          ({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })
        ),
      })
    );
    conversation.running = true;

    return { conversation, userCatalog, message, mapState };
  }

  /**
   * @summary Run a turn to its end. Never rejects: what goes wrong is reported
   * as an `error` event, and the turn is discarded as a whole. Actions already
   * sent to the browser stay done, which the next map state tells the model.
   * @param signal Aborts when the client disconnects
   */
  async runTurn(turn: Turn, emit: Emit, signal: AbortSignal): Promise<void> {
    const { conversation } = turn;
    const { session } = conversation;
    const turnSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.#limits.turnTimeoutMs),
    ]);
    const usage: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    let outcome: string = "completed";

    emit({ type: "start", conversationId: conversation.id });

    try {
      const state = sanitizeMapState(turn.mapState, turn.userCatalog);
      const rendered = renderMapState(state, turn.userCatalog);
      const changed = rendered !== conversation.lastMapState;
      session.addUserMessage(
        buildUserMessage(turn.message, changed ? rendered : null)
      );

      const context: ToolContext = {
        userCatalog: turn.userCatalog,
        search: this.#search,
        maxLayersOn: this.#limits.maxLayersOn,
        visibleLayers: new Set(state.layers.map((layer) => layer.id)),
        wfs: this.#wfs,
        featureResults: conversation.featureResults,
        signal: turnSignal,
        wfsRequests: 0,
      };
      const truncated = await this.#loop(
        conversation,
        context,
        usage,
        emit,
        turnSignal
      );

      // Only now, so that a discarded turn can't hide a change from the model
      session.commit();
      conversation.lastMapState = rendered;
      conversation.turns += 1;
      emit({ type: "done", truncated });
    } catch (error) {
      session.rollback();
      outcome = this.#report(error, signal, turnSignal, emit);
    } finally {
      conversation.running = false;
      this.#conversations.touch(conversation);
      logger.info(
        `Turn ${outcome} on ${this.#provider.id}: ${usage.inputTokens} input tokens (${usage.cachedTokens} cached), ${usage.outputTokens} output tokens.`
      );
    }
  }

  async #loop(
    { session }: Conversation,
    context: ToolContext,
    usage: Usage,
    emit: Emit,
    signal: AbortSignal
  ): Promise<boolean> {
    for (let i = 0; i < this.#limits.maxIterations; i++) {
      const result = await session.run({
        onTextDelta: (delta) => emit({ type: "text", delta }),
        signal,
      });

      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      usage.cachedTokens += result.usage.cachedTokens;

      if (result.stopReason === "refusal") {
        throw new TurnStop("refusal");
      }
      if (result.stopReason === "max_tokens") {
        // A tool call that was cut off can't be trusted. A text can be shown.
        if (result.toolCalls.length > 0) {
          throw new TurnStop("max_tokens");
        }
        return true;
      }
      if (result.toolCalls.length === 0) {
        return false;
      }

      // Cached input costs a fraction, and it would otherwise make a long
      // conversation run out of budget on every turn.
      const spent = usage.inputTokens - usage.cachedTokens + usage.outputTokens;
      if (spent > this.#limits.turnMaxTokens) {
        throw new TurnStop("token_budget");
      }

      session.addToolResults(
        await this.#dispatch(result.toolCalls, context, emit, signal)
      );
    }
    throw new TurnStop("max_iterations");
  }

  /** @returns The results of all calls, in the order of the calls */
  async #dispatch(
    calls: ToolCall[],
    context: ToolContext,
    emit: Emit,
    signal: AbortSignal
  ): Promise<ToolResult[]> {
    const results = new Map<string, ToolResult>();

    const execute = async (call: ToolCall) => {
      emit({ type: "tool_status", tool: call.name, status: "running" });
      const { content, isError, events } = await this.#registry.run(
        call.name,
        call.input,
        context
      );
      signal.throwIfAborted();
      emit({
        type: "tool_status",
        tool: call.name,
        status: isError ? "failed" : "done",
      });
      events.forEach(emit);
      results.set(call.id, { callId: call.id, content, isError });
    };

    const isRead = (call: ToolCall) =>
      this.#registry.tools.find((t) => t.name === call.name)?.kind === "read";

    await untilAborted(Promise.all(calls.filter(isRead).map(execute)), signal);
    // Actions change the map, so they run one at a time, in the order asked for
    for (const call of calls.filter((c) => !isRead(c))) {
      await untilAborted(execute(call), signal);
    }

    return calls.map((call) => results.get(call.id) as ToolResult);
  }

  #report(
    error: unknown,
    clientSignal: AbortSignal,
    turnSignal: AbortSignal,
    emit: Emit
  ): string {
    if (clientSignal.aborted) {
      return "aborted by the client"; // No one is listening anymore
    }

    let code: TurnErrorCode = "model_error";
    if (error instanceof TurnStop) {
      code = error.code;
    } else if (turnSignal.aborted) {
      code = "timeout";
    } else {
      logger.error(`Model call failed: ${(error as Error).message}`);
    }
    emit({ type: "error", code, message: MESSAGES[code] });
    return `stopped (${code})`;
  }
}
