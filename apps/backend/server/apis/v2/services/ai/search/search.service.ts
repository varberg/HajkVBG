import path from "path";
import log4js from "log4js";

import configService from "../../config.service.js";
import defaultCatalogService from "../catalog.service.ts";
import type {
  Catalog,
  CatalogRecord,
  CatalogService,
  ConfigSource,
} from "../catalog.service.ts";
import type { UserCatalog } from "../access.service.ts";
import { isIndexBuildSkipped } from "../config.ts";
import { batchTexts, createEmbedder } from "./embedder.ts";
import type { Embedder } from "./embedder.ts";
import { buildKeywordIndex } from "./keywordIndex.ts";
import type { KeywordIndex } from "./keywordIndex.ts";
import { VectorCache, vectorKey } from "./vectorCache.ts";
import { VectorIndex, embeddingText } from "./vectorIndex.ts";

const logger = log4js.getLogger("service.ai.search");

const DEFAULT_LIMIT = 10;
// How many matches each ranking brings to the merge
const CANDIDATES = 50;
// Reciprocal rank fusion. The usual 60 was too flat: being mid-list in both
// rankings beat being near the top of one, which lost 5 of 35 questions.
const RRF_K = 10;
// A layer with only some words of a question is often noise, so those matches
// count for less. A layer with all of them keeps full weight. It must, as vector
// search always fills its list, and layers it can't rank would sink below that.
const PARTIAL_KEYWORD_WEIGHT = 0.5;
const QUERY_TIMEOUT_MS = 2_000;
const BATCH_TIMEOUT_MS = 60_000;
const REBUILD_DEBOUNCE_MS = 5_000;
const FAILED_BUILD_RETRY_MS = 5 * 60_000;

export interface SearchHit {
  record: CatalogRecord;
  score: number;
}

export interface SearchResult {
  hits: SearchHit[];
  /** "keyword" means that vector search wasn't available for this query. */
  mode: "hybrid" | "keyword";
}

/**
 * @summary Merge rankings with reciprocal rank fusion. Only ranks are used, as
 * the scores of the different rankings can't be compared.
 * @returns All ids with their merged scores, best first
 */
export function fuseRankings(
  rankings: Array<{ ids: string[]; weight: number }>
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const { ids, weight } of rankings) {
    ids.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (RRF_K + rank + 1));
    });
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

type MapSource = ConfigSource & {
  getAvailableMaps(): Promise<string[] | { error: Error }>;
};

interface SearchServiceOptions {
  catalogs?: Pick<
    CatalogService,
    "getCatalog" | "onChange" | "startWatching" | "stopWatching"
  >;
  config?: MapSource;
  /** Null turns vector search off. */
  embedder?: Embedder | null;
  cacheDir?: string;
  debounceMs?: number;
  now?: () => number;
  /** Index from the vector cache alone, if it has anything for the map. */
  skipIndexBuild?: boolean;
}

/**
 * @summary Hybrid search over the layers of a map.
 * @description The indexes are built once per map from the raw catalog, and
 * every search is limited to a UserCatalog before any top matches are picked.
 * Vector search is optional at all times: until the index is ready, or when
 * the embedding API fails, searches run on keywords alone.
 */
export class SearchService {
  #catalogs: NonNullable<SearchServiceOptions["catalogs"]>;
  #config: MapSource;
  #embedder: Embedder | null;
  #cacheDir: string;
  #debounceMs: number;
  #now: () => number;
  #skipIndexBuild: boolean;

  #keyword = new Map<string, { catalog: Catalog; index: KeywordIndex }>();
  #vectors = new Map<string, { catalog: Catalog; index: VectorIndex }>();
  #failedAt = new Map<string, number>();

  // Builds run one at a time, in this queue
  #buildQueue: Promise<void> = Promise.resolve();
  #queued = new Set<string>();
  #refreshTimer: NodeJS.Timeout | null = null;
  #stopListening: (() => void) | null = null;

  constructor({
    catalogs,
    config,
    embedder,
    cacheDir,
    debounceMs,
    now,
    skipIndexBuild,
  }: SearchServiceOptions = {}) {
    this.#catalogs = catalogs ?? defaultCatalogService;
    this.#config = config ?? (configService as unknown as MapSource);
    this.#embedder = embedder === undefined ? createEmbedder() : embedder;
    this.#cacheDir =
      cacheDir ?? path.join(process.cwd(), "App_Data", "ai-cache");
    this.#debounceMs = debounceMs ?? REBUILD_DEBOUNCE_MS;
    this.#now = now ?? Date.now;
    this.#skipIndexBuild = skipIndexBuild ?? isIndexBuildSkipped();
  }

  /**
   * @summary Search the layers a user may see.
   * @returns The user's own view of the matching records, best first
   */
  async search(
    userCatalog: UserCatalog,
    query: string,
    limit = DEFAULT_LIMIT
  ): Promise<SearchResult> {
    const text = query.trim();
    if (text === "") {
      return { hits: [], mode: "keyword" };
    }

    const catalog = await this.#catalogs.getCatalog(userCatalog.map);
    const { recordsById } = userCatalog;
    const isAllowed = (id: string) => recordsById.has(id);

    // Indexed text includes group info. A user who reaches a layer outside the
    // tree must not get a match on that, or the ranking gives the group away.
    const ownView = new Set(
      userCatalog.records
        .filter((r) => r.groupId !== catalog.recordsById.get(r.id)?.groupId)
        .map((r) => r.id)
    );

    const [keywordIndex, vectorIds] = await Promise.all([
      this.#keywordIndex(catalog),
      this.#vectorRanking(
        catalog,
        text,
        (id) => isAllowed(id) && !ownView.has(id)
      ),
    ]);
    const scope = { isAllowed, ownView };
    const keywordIds = keywordIndex.search(text, CANDIDATES, scope);
    const allWordsIds = keywordIndex.search(text, CANDIDATES, scope, "all");

    const hits: SearchHit[] = [];
    const fused = fuseRankings([
      { ids: keywordIds, weight: PARTIAL_KEYWORD_WEIGHT },
      { ids: allWordsIds, weight: 1 },
      { ids: vectorIds ?? [], weight: 1 },
    ]);
    for (const { id, score } of fused) {
      const record = recordsById.get(id);
      if (record !== undefined) {
        hits.push({ record, score });
      }
    }

    return {
      hits: hits.slice(0, limit),
      mode: vectorIds === null ? "keyword" : "hybrid",
    };
  }

  async #keywordIndex(catalog: Catalog): Promise<KeywordIndex> {
    const hit = this.#keyword.get(catalog.map);
    if (hit?.catalog === catalog) {
      return hit.index;
    }
    const index = await buildKeywordIndex(catalog);
    this.#keyword.set(catalog.map, { catalog, index });
    return index;
  }

  /** @returns Ranked ids, or null if vector search can't be used right now */
  async #vectorRanking(
    catalog: Catalog,
    query: string,
    isAllowed: (id: string) => boolean
  ): Promise<string[] | null> {
    if (this.#embedder === null) {
      return null;
    }
    this.#requestBuild(catalog);

    // During a rebuild the previous index is still far better than none
    const index = this.#vectors.get(catalog.map)?.index;
    if (index === undefined) {
      logger.warn(
        `Vector index of map "${catalog.map}" isn't ready, using keyword search.`
      );
      return null;
    }

    try {
      const [vector] = await this.#embedder.embed(
        [query],
        "query",
        AbortSignal.timeout(QUERY_TIMEOUT_MS)
      );
      return index.search(vector, CANDIDATES, isAllowed);
    } catch (error) {
      logger.warn(
        `Query embedding failed, using keyword search: ${(error as Error).message}`
      );
      return null;
    }
  }

  // The file watcher is optional, so a search can be what notices a change.
  #requestBuild(catalog: Catalog): void {
    const { map } = catalog;
    const failedAt = this.#failedAt.get(map);
    if (
      this.#vectors.get(map)?.catalog === catalog ||
      this.#refreshTimer !== null ||
      (failedAt !== undefined && this.#now() - failedAt < FAILED_BUILD_RETRY_MS)
    ) {
      return;
    }
    void this.#enqueueBuild(map);
  }

  #enqueueBuild(map: string): Promise<void> {
    if (this.#queued.has(map)) {
      return this.#buildQueue;
    }
    this.#queued.add(map);

    this.#buildQueue = this.#buildQueue.then(async () => {
      // Removed before the build, so a change during it queues another one
      this.#queued.delete(map);
      try {
        await this.#build(map);
        this.#failedAt.delete(map);
      } catch (error) {
        this.#failedAt.set(map, this.#now());
        logger.warn(
          `Vector index of map "${map}" failed, using keyword search: ${
            (error as Error).message
          }`
        );
      }
    });
    return this.#buildQueue;
  }

  async #build(map: string): Promise<void> {
    const embedder = this.#embedder;
    const catalog = await this.#catalogs.getCatalog(map);
    if (embedder === null || this.#vectors.get(map)?.catalog === catalog) {
      return;
    }

    const started = this.#now();
    const documents = catalog.records.map((record) => {
      const text = embeddingText(record);
      return { id: record.id, text, key: vectorKey(embedder.id, text) };
    });

    const cache = await VectorCache.load(
      path.join(this.#cacheDir, `${catalog.map}.vectors.json`)
    );
    const missing = new Map(
      documents
        .filter(({ key }) => cache.get(key) === undefined)
        .map(({ key, text }) => [text, key])
    );

    // The file stays as it is, as the vectors of a layer being edited would
    // otherwise be dropped. With nothing to reuse, the build runs as usual.
    const cached = documents.filter(({ key }) => cache.get(key) !== undefined);
    if (this.#skipIndexBuild && cached.length > 0) {
      this.#vectors.set(map, {
        catalog,
        index: new VectorIndex(
          cached.map(({ id, key }) => ({ id, vector: cache.get(key)! }))
        ),
      });
      logger.warn(
        `AI_DEBUG_SKIP_INDEX_BUILD: vector index of map "${map}" uses the cache alone. ${cached.length} of ${documents.length} layers have vectors, the rest are only found by keywords.`
      );
      return;
    }

    try {
      for (const batch of batchTexts(
        [...missing.keys()],
        embedder.maxBatchTexts
      )) {
        const vectors = await embedder.embed(
          batch,
          "document",
          AbortSignal.timeout(BATCH_TIMEOUT_MS)
        );
        batch.forEach((text, i) => cache.set(missing.get(text)!, vectors[i]));
      }
    } finally {
      // Also after a failure, so the next attempt continues from here
      cache.retainOnly(new Set(documents.map(({ key }) => key)));
      await cache.save();
    }

    this.#vectors.set(map, {
      catalog,
      index: new VectorIndex(
        documents.map(({ id, key }) => ({ id, vector: cache.get(key)! }))
      ),
    });
    logger.info(
      `Vector index of map "${map}" ready: ${documents.length} layers, ${
        missing.size
      } embedded, in ${this.#now() - started} ms.`
    );
  }

  /**
   * @summary Build the vector index of a map now, unless it's up to date.
   * @returns When the build is over. A failed build doesn't reject: it's logged
   * and searches stay on keywords.
   */
  buildVectors(map: string): Promise<void> {
    return this.#embedder === null
      ? Promise.resolve()
      : this.#enqueueBuild(map);
  }

  /**
   * @summary Start indexing the maps that have the chat, in the background, and
   * keep the indexes up to date when files change. Safe to call repeatedly.
   */
  async start(): Promise<void> {
    if (this.#embedder === null || this.#stopListening !== null) {
      return;
    }
    this.#stopListening = this.#catalogs.onChange(() =>
      this.#debounceRefresh()
    );
    await this.#catalogs.startWatching();
    await this.#refresh();
  }

  async stop(): Promise<void> {
    this.#stopListening?.();
    this.#stopListening = null;
    clearTimeout(this.#refreshTimer ?? undefined);
    this.#refreshTimer = null;
    await this.#catalogs.stopWatching();
    await this.#buildQueue;
  }

  // Saving in Admin touches several files in a row, which gives one rebuild.
  #debounceRefresh(): void {
    clearTimeout(this.#refreshTimer ?? undefined);
    this.#refreshTimer = setTimeout(() => {
      this.#refreshTimer = null;
      void this.#refresh();
    }, this.#debounceMs);
    this.#refreshTimer.unref();
  }

  // Maps that didn't change cost nothing, as their catalogs are still the same.
  async #refresh(): Promise<void> {
    this.#failedAt.clear();
    try {
      for (const map of await this.#chatMaps()) {
        void this.#enqueueBuild(map);
      }
    } catch (error) {
      logger.warn(`Could not list maps to index: ${(error as Error).message}`);
    }
  }

  async #chatMaps(): Promise<string[]> {
    const maps = await this.#config.getAvailableMaps();
    if (!Array.isArray(maps)) {
      throw maps.error;
    }

    const chatMaps: string[] = [];
    for (const map of maps) {
      const { tools, error } = await this.#config.getMapConfig(
        map,
        undefined,
        false
      );
      const hasChat =
        Array.isArray(tools) && tools.some((t) => t?.type === "aichat");
      if (error === undefined && hasChat) {
        chatMaps.push(map);
      }
    }
    return chatMaps;
  }
}

export default new SearchService();
