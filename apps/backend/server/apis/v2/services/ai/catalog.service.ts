import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import log4js from "log4js";

import configService from "../config.service.js";
import { validateMapName } from "../../utils/safePath.js";
import { buildCatalog } from "./catalog/build.ts";
import type { Catalog, ConfigSource } from "./catalog/types.ts";

// The catalog's modules are in catalog/. These keep the imports elsewhere as
// they were.
export type * from "./catalog/types.ts";
export { cleanHtml, cleanInline } from "./catalog/text.ts";
export {
  infoboxFields,
  isDisplayLabel,
  walkMapConfig,
} from "./catalog/walk.ts";
export { buildCatalog, groupsWithLeaves } from "./catalog/build.ts";

const logger = log4js.getLogger("service.ai.catalog");

interface CatalogServiceOptions {
  config?: ConfigSource;
  appDataDir?: string;
}

interface CacheEntry {
  signature: string;
  catalog: Promise<Catalog>;
}

type ChangeListener = (fileName: string) => void;

/**
 * @summary Keeps one raw catalog per map in memory.
 * @description Follows the pattern in informative/documentCache.js. Every read
 * compares the mtimes of the source files, so a stale catalog is never served.
 * The optional file watcher adds the ability to react to a change right away.
 */
export class CatalogService {
  #config: ConfigSource;
  #appDataDir: string;
  #cache = new Map<string, CacheEntry>();
  #listeners = new Set<ChangeListener>();
  #watcher: ReturnType<typeof chokidar.watch> | null = null;

  constructor({ config, appDataDir }: CatalogServiceOptions = {}) {
    this.#config = config ?? (configService as unknown as ConfigSource);
    this.#appDataDir = appDataDir ?? path.join(process.cwd(), "App_Data");
  }

  async getCatalog(map: string): Promise<Catalog> {
    const safeMap: string = validateMapName(map);
    // Read before building: a file that changes during the build then gets
    // cached under its old signature, and the next read rebuilds it.
    const signature = await this.#signature(safeMap);

    const hit = this.#cache.get(safeMap);
    if (hit?.signature === signature) {
      return hit.catalog;
    }

    const entry: CacheEntry = {
      signature,
      catalog: this.#build(safeMap).catch((error) => {
        // A file that fails to parse, e.g. mid-write, must not stay cached.
        if (this.#cache.get(safeMap) === entry) {
          this.#cache.delete(safeMap);
        }
        throw error;
      }),
    };
    this.#cache.set(safeMap, entry);
    return entry.catalog;
  }

  async #signature(map: string): Promise<string> {
    const stats = await Promise.all(
      [`${map}.json`, "layers.json"].map((file) =>
        fs.promises.stat(path.join(this.#appDataDir, file))
      )
    );
    return stats.map((s) => `${s.mtimeMs}:${s.size}`).join("|");
  }

  async #build(map: string): Promise<Catalog> {
    const [mapConfig, store] = await Promise.all([
      this.#config.getMapConfig(map, undefined, false),
      this.#config.getLayersStore(undefined, false),
    ]);
    if (mapConfig.error) throw mapConfig.error;
    if (store.error) throw store.error;

    const catalog = buildCatalog(map, mapConfig, store);
    logger.debug(
      `Built catalog for map "${map}" with ${catalog.records.length} records.`
    );
    return catalog;
  }

  /**
   * @summary Subscribe to changes of map configs and the layers store. Only
   * fires while the watcher is running.
   * @returns A function that removes the listener
   */
  onChange(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #onFileEvent(filePath: string): void {
    // App_Data holds other things too, among them the vector cache folder.
    if (
      path.dirname(filePath) !== this.#appDataDir ||
      !filePath.endsWith(".json")
    ) {
      return;
    }
    const fileName = path.basename(filePath);
    if (fileName === "layers.json") {
      this.#cache.clear();
    } else {
      this.#cache.delete(fileName.replace(/\.json$/, ""));
    }
    this.#listeners.forEach((listener) => listener(fileName));
  }

  /**
   * @summary Start watching App_Data. Safe to call repeatedly. If the watcher
   * can't start, the mtime check alone still keeps the catalog correct.
   */
  startWatching(): Promise<void> {
    if (this.#watcher !== null) {
      return Promise.resolve();
    }

    const disable = (error: unknown) => {
      logger.warn(
        `File watcher unavailable, using mtime checks only: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
      this.#watcher = null;
    };

    return new Promise((resolve) => {
      try {
        this.#watcher = chokidar
          .watch(this.#appDataDir, {
            // Otherwise the process doesn't exit on SIGTERM, see Server's shutdown
            persistent: false,
            ignoreInitial: true,
            depth: 0,
            usePolling: process.env.INFORMATIVE_CACHE_POLLING === "true",
            interval: 2000,
          })
          .on("all", (_event, filePath) => this.#onFileEvent(filePath))
          .on("error", (error) => {
            disable(error);
            resolve();
          })
          .on("ready", () => resolve());
      } catch (error) {
        disable(error);
        resolve();
      }
    });
  }

  async stopWatching(): Promise<void> {
    const watcher = this.#watcher;
    this.#watcher = null;
    await watcher?.close();
  }
}

export default new CatalogService();
