import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { McpServerConfig } from "../config.ts";

// A server that is down must not hold up the first question for long
const LIST_TIMEOUT_MS = 5_000;

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  /** `structuredContent`, or the text parsed as a JSON object. */
  structured: Record<string, unknown> | null;
  text: string;
  isError: boolean;
}

export interface McpConnection {
  listTools(): Promise<McpToolInfo[]>;
  call(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<McpCallResult>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @summary A connection to one MCP server over streamable HTTP, with its bearer
 * token, which never leaves the backend. It connects on first use, and again
 * after a failure.
 */
export function createMcpConnection(config: McpServerConfig): McpConnection {
  let client: Promise<Client> | null = null;

  const connect = (): Promise<Client> => {
    client ??= (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      });
      const created = new Client({ name: "hajk-backend", version: "1.0.0" });
      await created.connect(transport, { timeout: LIST_TIMEOUT_MS });
      return created;
    })();
    return client;
  };

  // The next call makes a new connection
  const reset = (error: unknown): never => {
    const stale = client;
    client = null;
    stale?.then((c) => c.close()).catch(() => {});
    throw error;
  };

  return {
    async listTools() {
      try {
        const connected = await connect();
        const tools: McpToolInfo[] = [];
        let cursor: string | undefined;
        do {
          const page = await connected.listTools(
            cursor === undefined ? undefined : { cursor },
            { timeout: LIST_TIMEOUT_MS }
          );
          for (const tool of page.tools) {
            tools.push({
              name: tool.name,
              description: tool.description ?? "",
              inputSchema: tool.inputSchema as Record<string, unknown>,
            });
          }
          cursor = page.nextCursor;
        } while (cursor !== undefined);
        return tools;
      } catch (error) {
        return reset(error);
      }
    },

    async call(name, args, signal) {
      try {
        const connected = await connect();
        const result = await connected.callTool(
          { name, arguments: args },
          undefined,
          { signal, timeout: config.timeoutMs }
        );
        const content = Array.isArray(result.content) ? result.content : [];
        const text = content
          .filter((item) => item.type === "text")
          .map((item) => (item as { text: string }).text)
          .join("\n");
        return {
          structured: isObject(result.structuredContent)
            ? result.structuredContent
            : parseObject(text),
          text,
          isError: result.isError === true,
        };
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
        return reset(error);
      }
    },
  };
}
