import type { Request, RequestHandler, Response } from "express";
import log4js from "log4js";

import { isChatEnabled } from "../../services/ai/config.ts";
import type {
  ChatEvent,
  Orchestrator,
  Turn,
} from "../../services/ai/orchestrator.ts";
import { AiChatError } from "../../utils/AiChatError.ts";
import handleStandardResponse from "../../utils/handleStandardResponse.js";

const logger = log4js.getLogger("controller.ai");

// Also stated in api.v2.yml
const MAX_MESSAGE_LENGTH = 4000;
// Well below the idle timeouts that proxies usually have
const KEEP_ALIVE_MS = 15_000;

// Loaded on first use, so an install with the chat turned off never loads it
const loadOrchestrator = async (): Promise<Orchestrator> => {
  const { getOrchestrator } = await import("../../services/ai/chat.service.ts");
  return getOrchestrator();
};

interface ChatBody {
  map?: unknown;
  conversationId?: unknown;
  message?: unknown;
  mapState?: unknown;
}

// The OpenAPI validator is added after the routers, so it never sees requests
// that a route handles. That makes these checks the ones that count, and every
// message that gets through here costs a model turn.
function readTurnRequest(req: Request, res: Response) {
  const { map, conversationId, message, mapState } = (req.body ??
    {}) as ChatBody;
  const isValid =
    typeof map === "string" &&
    typeof message === "string" &&
    message.trim() !== "" &&
    message.length <= MAX_MESSAGE_LENGTH &&
    (conversationId === null || typeof conversationId === "string");

  if (!isValid) {
    throw new AiChatError(
      "invalid_request",
      400,
      `A map, a conversationId or null, and a message of at most ${MAX_MESSAGE_LENGTH} characters are required.`
    );
  }
  return {
    map,
    user: res.locals.authUser as string | undefined,
    conversationId,
    message: message.trim(),
    mapState,
  };
}

/**
 * @summary An error that is safe to show on a public route. The messages of
 * other errors can hold file paths and the like.
 */
function publicError(error: { code?: string; statusCode?: number } & Error) {
  if (error.statusCode !== undefined) {
    return error;
  }
  if (error.code === "ENOENT") {
    return new AiChatError("map_not_found", 404, "The map doesn't exist.");
  }
  logger.error(`Chat request failed: ${error.message}`);
  return new AiChatError("unavailable", 500, "The chat request failed.");
}

/**
 * @summary An abort for when the client goes away. Made before the turn is set
 * up: a client that leaves meanwhile has already closed, which would be missed
 * by a listener added later, and the turn would then run with no one listening.
 */
function disconnectSignal(res: Response): AbortSignal {
  const disconnect = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) {
      disconnect.abort();
    }
  });
  return disconnect.signal;
}

async function stream(
  res: Response,
  orchestrator: Orchestrator,
  turn: Turn,
  signal: AbortSignal
) {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-transform also keeps compression() from buffering the stream
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const write = (chunk: string) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(chunk);
    }
  };
  const send = ({ type, ...data }: ChatEvent) =>
    write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

  const keepAlive = setInterval(() => write(": keep-alive\n\n"), KEEP_ALIVE_MS);
  try {
    // Also when the client has already gone, as only runTurn releases the turn
    await orchestrator.runTurn(turn, send, signal);
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
}

/**
 * @summary Create the handler of POST /ai/chat. Everything that can stop a
 * request ends in a plain HTTP error. Once the stream has started, it can only
 * end in an `error` event.
 */
export const createChatHandler =
  (
    getOrchestrator: () => Promise<Orchestrator> = loadOrchestrator,
    isEnabled: () => boolean = isChatEnabled
  ): RequestHandler =>
  async (req, res) => {
    const disconnected = disconnectSignal(res);
    let orchestrator: Orchestrator;
    let turn: Turn;

    try {
      if (!isEnabled()) {
        throw new AiChatError(
          "not_enabled",
          404,
          "AI chat isn't enabled (AI_CHAT_ENABLED in .env)."
        );
      }
      const request = readTurnRequest(req, res);
      orchestrator = await getOrchestrator();
      turn = await orchestrator.beginTurn(request);
    } catch (error) {
      handleStandardResponse(res, { error: publicError(error as Error) });
      return;
    }

    try {
      await stream(res, orchestrator, turn, disconnected);
    } catch (error) {
      logger.error(`Chat stream failed: ${(error as Error).message}`);
    }
  };

export default { chat: createChatHandler() };
