import log4js from "log4js";

import { ToolError } from "../toolSupport.ts";
import type { JsonSchema, Tool, ToolContext, ToolEvent } from "../tools.ts";
import { HIDDEN_ERROR, toModelContent } from "./exposure.ts";
import type { Exposure } from "./exposure.ts";
import { isErrorAnswer } from "./mcpClient.ts";
import type { McpConnection, McpToolInfo } from "./mcpClient.ts";
import { stripOmitted, toRegistrySchema } from "./mcpSchema.ts";

const logger = log4js.getLogger("service.ai.mcp");

const UNREACHABLE = "The service couldn't be reached. Try again later.";
const MAX_ERROR_LENGTH = 500;

export interface McpServer {
  name: string;
  exposure: Exposure;
  connection: McpConnection;
  /** Until when calls fail at once, as the server was down. Set by callMcp. */
  downUntil?: number;
}

// The first call after a long pause sometimes times out while the next one
// works, so a failed call is made once more on a new connection. The bridged
// tools only read, which makes that safe.
const ATTEMPTS = 2;
// After that, calls fail at once for a while, so that a server that never
// answers doesn't cost every call its timeouts and the turn its time limit
const DOWN_MS = 60_000;

/**
 * @summary Call an MCP tool and give its structured result.
 * @description A server that couldn't be reached on any attempt fails at
 * once for {@link DOWN_MS}, then gets tried again. With `client` exposure, no
 * text from the server reaches the model or the log, as an error message can
 * hold the data too.
 * @throws {ToolError} With a message the model may see
 */
export async function callMcp(
  server: McpServer,
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  now: () => number = Date.now
): Promise<Record<string, unknown>> {
  const hidden = server.exposure !== "model";
  if (server.downUntil !== undefined && now() < server.downUntil) {
    throw new ToolError(UNREACHABLE);
  }
  let result;
  for (let attempt = 1; result === undefined; attempt++) {
    try {
      result = await server.connection.call(tool, args, signal);
    } catch (error) {
      signal.throwIfAborted();
      if (attempt >= ATTEMPTS) {
        const reason = hidden ? "" : `: ${(error as Error).message}`;
        logger.warn(
          `The ${server.name} tool "${tool}" failed ${ATTEMPTS} times${reason}`
        );
        // A server that answered with an error is up, so only this call failed
        if (!isErrorAnswer(error)) {
          server.downUntil = now() + DOWN_MS;
          logger.warn(
            `The ${server.name} server seems down. Its tools fail at once for ${DOWN_MS / 1000} s.`
          );
        }
        throw new ToolError(UNREACHABLE);
      }
    }
  }
  server.downUntil = undefined;
  if (result.isError) {
    throw new ToolError(
      hidden
        ? HIDDEN_ERROR
        : result.text.slice(0, MAX_ERROR_LENGTH) || HIDDEN_ERROR
    );
  }
  if (result.structured === null) {
    throw new ToolError(hidden ? HIDDEN_ERROR : "The tool gave no result.");
  }
  return result.structured;
}

export interface BridgeOptions {
  server: McpServer;
  tool: McpToolInfo;
  /**
   * Required with `client` exposure, where nothing the server writes may reach
   * the model. Otherwise the server's own description is used.
   */
  description?: string;
  /** See toRegistrySchema. */
  replacements?: Record<string, JsonSchema>;
  /** Turns the model's input into the server's, such as finding a feature. */
  prepare?: (
    input: Record<string, unknown>,
    inputSchema: JsonSchema,
    context: ToolContext
  ) => Promise<Record<string, unknown>>;
  /** What the model sees with `model` exposure. Defaults to all of it. */
  view?: (result: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Whether to keep the result for a later action, which adds a `resultId`.
   * Results of a `client` server are always kept, as they can't go anywhere else.
   */
  keep?: (result: Record<string, unknown>) => boolean;
  now?: () => number;
}

/**
 * @summary Make a registry tool of an MCP tool. Every result goes through
 * toModelContent, so its server's exposure decides what the model gets.
 * @throws {UnsupportedSchemaError} If the input schema can't be converted
 * @throws {Error} If a `client` server's tool has no description from Hajk
 */
export function bridgeTool(options: BridgeOptions): Tool {
  const { server, tool, prepare, view, keep } = options;
  const now = options.now ?? Date.now;
  const hidden = server.exposure !== "model";
  if (hidden && options.description === undefined) {
    throw new Error(
      `The ${server.name} tool "${tool.name}" needs a description from Hajk, as its server has client exposure.`
    );
  }
  const inputSchema = toRegistrySchema(tool.inputSchema, options.replacements);

  return {
    name: tool.name,
    kind: "read",
    description: options.description ?? tool.description,
    inputSchema,
    async run(input, context) {
      const prepared = prepare
        ? await prepare(input as Record<string, unknown>, inputSchema, context)
        : (input as Record<string, unknown>);
      const args = stripOmitted(prepared, tool.inputSchema);
      const result = await callMcp(
        server,
        tool.name,
        args,
        context.signal,
        now
      );

      const kept = hidden || (keep?.(result) ?? false);
      const resultId = kept
        ? context.mcpResults.add({
            server: server.name,
            tool: tool.name,
            args,
            result,
            createdAt: now(),
          })
        : null;
      const events: ToolEvent[] =
        hidden && resultId !== null
          ? [
              {
                type: "mcp_result",
                server: server.name,
                tool: tool.name,
                resultId,
                result,
              },
            ]
          : [];
      const modelView = hidden ? {} : (view?.(result) ?? result);
      return {
        result: toModelContent(server.exposure, modelView, resultId),
        events,
      };
    },
  };
}
