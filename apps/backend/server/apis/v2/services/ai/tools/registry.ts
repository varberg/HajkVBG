import log4js from "log4js";

import { ToolError } from "../toolSupport.ts";
import { featureTools } from "./featureTools.ts";
import { layerTools } from "./layerTools.ts";
import { mapTools } from "./mapTools.ts";
import { validateInput } from "./schema.ts";
import { suggestionTools } from "./suggestionTools.ts";
import type {
  Tool,
  ToolContext,
  ToolDefinition,
  ToolExtension,
  ToolRun,
} from "./types.ts";

const logger = log4js.getLogger("service.ai.tools");

/**
 * The tools of the chat. Independent of transport and provider, and the order
 * is fixed, because a changed tool list breaks the prompt cache.
 */
export const tools: Tool[] = [
  ...layerTools,
  ...mapTools,
  ...featureTools,
  ...suggestionTools,
];

const byName = (list: Tool[]) => new Map(list.map((tool) => [tool.name, tool]));

const failure = (message: string): ToolRun => ({
  content: JSON.stringify({ error: message }),
  isError: true,
  events: [],
});

/**
 * @summary Run a tool. Never rejects: a tool that fails gives a result that says
 * so, as the model needs an answer to every call and can often recover.
 */
async function runIn(
  available: Map<string, Tool>,
  name: string,
  input: unknown,
  context: ToolContext
): Promise<ToolRun> {
  const tool = available.get(name);
  if (tool === undefined) {
    return failure(`Unknown tool "${name}".`);
  }

  const problem = validateInput(tool.inputSchema, input);
  if (problem !== null) {
    return failure(problem);
  }

  try {
    const { result, events = [] } = await tool.run(input, context);
    return { content: JSON.stringify(result), isError: false, events };
  } catch (error) {
    if (error instanceof ToolError) {
      return failure(error.message);
    }
    logger.error(`Tool "${name}" failed: ${(error as Error).message}`);
    return failure("The tool failed.");
  }
}

/** What the orchestrator needs of the tools. A test can give only some of it. */
export interface ToolRegistry {
  /** The tools of new conversations. Extensions are only ever added. */
  readonly tools: ToolDefinition[];
  run(name: string, input: unknown, context: ToolContext): Promise<ToolRun>;
  /**
   * What the extensions add to the system prompt: the prompt of each loaded
   * one, and the `unavailablePrompt` of each that isn't.
   */
  readonly promptSections?: string[];
  /** Try to load the extensions that aren't loaded yet. Never rejects. */
  refresh?(): Promise<void>;
}

const RETRY_MS = 60_000;

/**
 * @summary The built-in tools, then the tools of each extension once it has
 * loaded. An extension that fails is tried again at most once a minute, and the
 * chat works without it in the meantime. The order stays the same, as a changed
 * tool list breaks the prompt cache.
 */
export function createRegistry(
  extensions: ToolExtension[] = [],
  now: () => number = Date.now
): Required<ToolRegistry> {
  const loaded = new Map<string, { tools: Tool[]; prompt: string }>();
  const lastTry = new Map<string, number>();
  // Loads that are running, which a turn starting meanwhile waits for
  const loading = new Map<string, Promise<void>>();
  let all: Tool[] = tools;
  let available = byName(tools);
  let promptSections: string[] = [];

  const rebuild = () => {
    const parts = extensions.flatMap((e) => loaded.get(e.name) ?? []);
    all = [...tools, ...parts.flatMap((part) => part.tools)];
    available = byName(all);
    promptSections = extensions.flatMap(
      (e) => loaded.get(e.name)?.prompt ?? e.unavailablePrompt ?? []
    );
  };
  rebuild();

  async function load(extension: ToolExtension): Promise<void> {
    lastTry.set(extension.name, now());
    try {
      const part = await extension.load();
      const taken = part.tools.find((tool) =>
        all.some((t) => t.name === tool.name)
      );
      if (taken !== undefined) {
        throw new Error(`The tool name "${taken.name}" is already in use.`);
      }
      loaded.set(extension.name, part);
      rebuild();
      logger.debug(`${extension.name}: ${part.tools.length} tools.`);
    } catch (error) {
      logger.warn(
        `Could not load the ${extension.name} tools, the chat runs without them: ${(error as Error).message}`
      );
    }
  }

  return {
    get tools() {
      return all;
    },
    get promptSections() {
      return promptSections;
    },
    run: (name, input, context) => runIn(available, name, input, context),
    async refresh() {
      const due = extensions.filter(
        (e) =>
          !loaded.has(e.name) &&
          !loading.has(e.name) &&
          now() - (lastTry.get(e.name) ?? -Infinity) >= RETRY_MS
      );
      for (const extension of due) {
        loading.set(
          extension.name,
          load(extension).finally(() => loading.delete(extension.name))
        );
      }
      // Also the loads that another turn started, so that a turn starting
      // meanwhile isn't told that the extension is unavailable
      await Promise.all(loading.values());
    },
  };
}
