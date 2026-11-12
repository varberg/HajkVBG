/**
 * Refreshes test/ai/routing-tools.json from the routing MCP server: its
 * `instructions` and its tool list, which the routing tests run against.
 *
 *   npm run snapshot:routing
 *
 * Reads AI_ROUTING_MCP_URL and AI_ROUTING_MCP_TOKEN from .env. The token is
 * only sent to the server, never written or logged.
 */
import fs from "node:fs";

import { createMcpConnection } from "../server/apis/v2/services/ai/mcp/mcpClient.ts";

const OUT = new URL("../test/ai/routing-tools.json", import.meta.url);

const url = process.env.AI_ROUTING_MCP_URL?.trim();
const token = process.env.AI_ROUTING_MCP_TOKEN?.trim();
if (!url || !token) {
  console.error(
    "Set AI_ROUTING_MCP_URL and AI_ROUTING_MCP_TOKEN in .env to take a snapshot."
  );
  process.exit(1);
}

const connection = createMcpConnection({
  name: "routing",
  url,
  token,
  timeoutMs: 15_000,
  exposure: "model",
});

try {
  const tools = await connection.listTools();
  const instructions = await connection.getInstructions();
  fs.writeFileSync(
    OUT,
    `${JSON.stringify({ instructions, tools }, null, 2)}\n`,
    "utf-8"
  );
  console.log(
    `Wrote ${tools.length} tools and ${instructions?.length ?? 0} characters of instructions to test/ai/routing-tools.json.`
  );
  process.exit(0);
} catch (error) {
  // Only the message: an error object could hold the request headers
  console.error(
    `Couldn't reach the routing server at ${url}: ${(error as Error).message}`
  );
  process.exit(1);
}
