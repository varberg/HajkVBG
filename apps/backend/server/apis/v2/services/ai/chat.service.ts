import log4js from "log4js";

import { AiChatError } from "../../utils/AiChatError.ts";
import accessService from "./access.service.ts";
import { readChatLimits, readWfsTimeoutMs } from "./config.ts";
import { createWfsAccess } from "./features/wfsAccess.ts";
import instructionsService from "./instructions.ts";
import { readMcpExtensions } from "./mcp/servers/index.ts";
import { Orchestrator } from "./orchestrator.ts";
import { createProvider } from "./providers/index.ts";
import searchService from "./search/search.service.ts";
import { createRegistry } from "./tools.ts";

const logger = log4js.getLogger("service.ai.chat");

let orchestrator: Promise<Orchestrator> | null = null;

async function create(): Promise<Orchestrator> {
  const provider = await createProvider();
  logger.info(`AI chat runs on ${provider.id}.`);
  return new Orchestrator({
    provider,
    access: accessService,
    search: searchService,
    wfs: createWfsAccess(readWfsTimeoutMs()),
    registry: createRegistry(readMcpExtensions()),
    limits: readChatLimits(),
    instructions: instructionsService,
  });
}

/**
 * @summary The one orchestrator of this process, which owns the conversations.
 * @throws {AiChatError} With status 503 if the provider isn't configured. That
 * only affects the chat, the rest of the backend carries on as usual.
 */
export function getOrchestrator(): Promise<Orchestrator> {
  orchestrator ??= create().catch((error) => {
    if (!(error instanceof AiChatError)) {
      logger.error(`Could not start the AI chat: ${error.message}`);
      throw new AiChatError("unavailable", 503, "AI chat is unavailable.");
    }
    logger.error(error.message);
    throw error;
  });
  return orchestrator;
}
