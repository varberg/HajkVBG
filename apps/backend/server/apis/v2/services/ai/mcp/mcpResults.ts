const MAX_RESULTS = 50;

/** A call to an MCP tool and what it returned, kept so it can be shown later. */
export interface McpResult {
  server: string;
  tool: string;
  /** As sent to the server, so that the call can be made again. */
  args: Record<string, unknown>;
  /** The whole result, also the parts the model never sees. */
  result: Record<string, unknown>;
  createdAt: number;
}

/**
 * @summary The MCP results of a conversation, so that the model can refer to
 * one by id, as with FeatureResultStore. The oldest are dropped first.
 */
export class McpResultStore {
  #results = new Map<string, McpResult>();
  #next = 1;

  add(result: McpResult): string {
    const id = `m${this.#next++}`;
    this.#results.set(id, result);
    if (this.#results.size > MAX_RESULTS) {
      this.#results.delete(this.#results.keys().next().value as string);
    }
    return id;
  }

  get(id: string): McpResult | undefined {
    return this.#results.get(id);
  }

  /** Replace a result in place, keeping its id, such as with a fresh link. */
  replace(id: string, result: McpResult): void {
    if (this.#results.has(id)) {
      this.#results.set(id, result);
    }
  }
}
