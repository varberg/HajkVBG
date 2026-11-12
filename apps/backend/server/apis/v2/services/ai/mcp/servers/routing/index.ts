import type { McpServerConfig } from "../../../config.ts";
import { createMcpConnection } from "../../mcpClient.ts";
import type { ToolExtension } from "../../../tools.ts";
import { ROUTING_INSTRUCTIONS, buildRoutingTools } from "./routingTools.ts";

/**
 * @summary Routing on NVDB and the public transport timetable, through the
 * routing MCP server. Its results must reach the model, which answers from
 * them, so it needs `model` exposure.
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
    async load() {
      const tools = buildRoutingTools(
        server,
        await server.connection.listTools()
      );
      if (tools.length === 0) {
        throw new Error("The server has none of the expected tools.");
      }
      return { tools, prompt: ROUTING_INSTRUCTIONS };
    },
  };
}
