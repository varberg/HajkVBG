import "./common/env.js";
import Server from "./common/server.js";
import routes from "./routes.js";
import log4js from "./common/utils/hajkLogger.js";
import { isChatEnabled } from "./apis/v2/services/ai/config.ts";
import { preload } from "./apis/v2/services/informative/documentCache.js";

// Indexing the layers for the AI chat runs in the background, and the import keeps
// the AI code from loading when the chat is off. A failure here only means that the
// chat searches on keywords, which must never stop the map backend.
const startAiSearch = async () => {
  try {
    const { default: searchService } =
      await import("./apis/v2/services/ai/search/search.service.ts");
    await searchService.start();
  } catch (error) {
    log4js
      .getLogger("service.ai.search")
      .warn(`Could not start indexing layers: ${error.message}`);
  }
};

// router() is async (it awaits proxy + body-parser registration before mounting
// the API routers), so we start listening only once everything is wired up.
// When INFORMATIVE_CACHE_PRELOAD=true the App_Data cache is warmed before the
// server accepts any traffic; preload() never throws (bad files are logged
// and skipped), so a broken file can never block startup.
export default new Server().router(routes).then(async (server) => {
  if (process.env.INFORMATIVE_CACHE_PRELOAD === "true") {
    await preload();
  }
  if (isChatEnabled()) {
    void startAiSearch();
  }
  return server.listen(process.env.PORT);
});
