import log4js from "log4js";

import { readMcpServerConfig } from "../../config.ts";
import type { McpServerConfig } from "../../config.ts";
import type { ToolExtension } from "../../tools.ts";
import { createRoutingExtension } from "./routing/index.ts";

const logger = log4js.getLogger("service.ai.mcp");

/**
 * The MCP servers the chat knows, by the `<NAME>` of their `AI_<NAME>_MCP_*`
 * settings. To add one: set its `AI_<NAME>_MCP_*` in .env and .env.example,
 * add a folder here with a `create<Name>Extension`, and list it below.
 */
const SERVERS: Record<string, (config: McpServerConfig) => ToolExtension> = {
  ROUTING: createRoutingExtension,
};

/** @summary The extensions of the MCP servers that are configured. */
export function readMcpExtensions(): ToolExtension[] {
  const extensions: ToolExtension[] = [];
  for (const [name, create] of Object.entries(SERVERS)) {
    const config = readMcpServerConfig(name);
    if (config === null) {
      const label = name.charAt(0) + name.slice(1).toLowerCase();
      logger.info(
        `${label} is off, as AI_${name}_MCP_URL or AI_${name}_MCP_TOKEN isn't set.`
      );
      continue;
    }
    try {
      extensions.push(create(config));
    } catch (error) {
      logger.error((error as Error).message);
    }
  }
  return extensions;
}
