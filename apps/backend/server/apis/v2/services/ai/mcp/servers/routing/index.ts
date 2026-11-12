import log4js from "log4js";

import type { McpServerConfig } from "../../../config.ts";
import { createMcpConnection } from "../../mcpClient.ts";
import type { ToolExtension } from "../../../tools.ts";
import { buildRoutingPrompt, buildRoutingTools } from "./routingTools.ts";

const logger = log4js.getLogger("service.ai.routing");

const ROUTING_UNAVAILABLE = `Routing:
- The routing service can't be reached right now, so questions about routes, travel times, reachable areas and public transport can't be answered. Say so, and that the user can try again later by starting a new conversation. Never answer them from memory.`;

/**
 * @summary Routing by car, bike, walking and public transport, through the
 * routing MCP server, which describes its own area and data. Its results
 * must reach the model, which answers from them, so it needs `model` exposure.
 * @throws {Error} If the exposure isn't `model`
 */
export function createRoutingExtension(config: McpServerConfig): ToolExtension {
  if (config.exposure !== "model") {
    throw new Error(
      "Routing needs AI_ROUTING_MCP_EXPOSURE=model, as the model answers from its results."
    );
  }
  const server = {
    name: config.name,
    exposure: config.exposure,
    connection: createMcpConnection(config),
  };
  return {
    name: config.name,
    unavailablePrompt: ROUTING_UNAVAILABLE,
    async load() {
      const tools = buildRoutingTools(
        server,
        await server.connection.listTools()
      );
      if (tools.length === 0) {
        throw new Error("The server has none of the expected tools.");
      }
      // From the handshake that listTools already waited for, so no request
      let instructions: string | null = null;
      try {
        instructions = await server.connection.getInstructions();
      } catch (error) {
        logger.warn(
          `Couldn't read the routing server's instructions: ${(error as Error).message}`
        );
      }
      return { tools, prompt: buildRoutingPrompt(instructions) };
    },
  };
}
