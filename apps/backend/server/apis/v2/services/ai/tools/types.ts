import type { UserCatalog } from "../access.service.ts";
import type { DrawnFeature } from "../features/drawn.ts";
import type { FeatureResultStore } from "../features/featureResults.ts";
import type { WfsAccess } from "../features/wfsAccess.ts";
import type { WfsResult } from "../features/wfsClient.ts";
import type { McpResultStore } from "../mcp/mcpResults.ts";
import type { SearchService } from "../search/search.service.ts";
import type { ToolEvent } from "./events.ts";

/**
 * The subset of JSON Schema that both providers' strict modes accept. Claude
 * rejects `minimum`, `maxItems`, `minLength` and the like with a 400, so bounds
 * are checked in the tools instead. Every property is required, and optional
 * values are nullable.
 */
export interface JsonSchema {
  type: string | string[];
  description?: string;
  enum?: Array<string | null>;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
}

/**
 * `read` tools have no side effects and may run in parallel, and can be reused
 * by MCP later. `action` tools reach the browser through events, so they run in
 * order and are never exposed outside the chat.
 */
export type ToolKind = "read" | "action";

export interface ToolDefinition {
  name: string;
  description: string;
  kind: ToolKind;
  inputSchema: JsonSchema;
  /**
   * Called last, after the answer: when a model turn calls nothing else, the
   * turn ends without handing the result back to the model, which saves a call.
   */
  endsTurn?: boolean;
  /** Left out of the conversations of maps where this is false. */
  isAvailable?: (userCatalog: UserCatalog) => boolean;
}

export interface ToolContext {
  userCatalog: UserCatalog;
  search: Pick<SearchService, "search">;
  maxLayersOn: number;
  /** The layers on the map, kept up to date by the actions of the turn. */
  visibleLayers: Set<string>;
  wfs: WfsAccess;
  /** Lives as long as the conversation. */
  featureResults: FeatureResultStore;
  /** Aborts with the turn. */
  signal: AbortSignal;
  /** WFS requests so far in this turn. */
  wfsRequests: number;
  /** Their answers, by request, see featureSearch.ts. */
  wfsResponses: Map<string, Promise<WfsResult>>;
  /** Lives as long as the conversation. */
  mcpResults: McpResultStore;
  /** What the user shared with this message, by id, see drawn.ts. */
  drawn: ReadonlyMap<string, DrawnFeature>;
}

export interface ToolOutput {
  result: unknown;
  events?: ToolEvent[];
}

export interface Tool extends ToolDefinition {
  run(input: unknown, context: ToolContext): Promise<ToolOutput> | ToolOutput;
}

export interface ToolRun {
  /** The result as JSON, ready to hand to the model. */
  content: string;
  isError: boolean;
  events: ToolEvent[];
}

/** Tools from outside the backend, such as an MCP server. */
export interface ToolExtension {
  name: string;
  /**
   * @returns The tools, and the part of the system prompt that explains them
   * @throws If they can't be loaded now, which is tried again later
   */
  load(): Promise<{ tools: Tool[]; prompt: string }>;
  /**
   * In the system prompt while the extension isn't loaded, so that the model
   * can tell the user why it can't answer, instead of not knowing it exists.
   */
  unavailablePrompt?: string;
}
