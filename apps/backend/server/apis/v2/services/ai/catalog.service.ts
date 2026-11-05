import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import log4js from "log4js";

import configService from "../config.service.js";
import { validateMapName } from "../../utils/safePath.js";

const logger = log4js.getLogger("service.ai.catalog");

export type LayerRole = "layer" | "background" | "search";

export type LayerType =
  "wms" | "wmts" | "wfs" | "wfst" | "vector" | "arcgis" | "builtin";

export interface SubLayer {
  id: string;
  caption: string | null;
}

/**
 * Everything the AI chat may know about a layer. This is an allowlist: a field
 * that isn't listed here, such as `url`, must never be added to a record.
 */
export interface CatalogRecord {
  id: string;
  role: LayerRole;
  type: LayerType;
  isGroupLayer: boolean;
  caption: string;
  groupPath: string[];
  groupId: string | null;
  owner: string | null;
  text: string | null;
  contentTag: string | null;
  subLayers: SubLayer[];
  subLayersToggleable: boolean;
  searchable: boolean;
  infoUrl: string | null;
  date: string | null;
}

export interface CatalogGroup {
  id: string;
  name: string;
  groupPath: string[];
  parentId: string | null;
  exclusive: boolean;
  leafLayerIds: string[];
}

export interface Catalog {
  map: string;
  records: CatalogRecord[];
  recordsById: Map<string, CatalogRecord>;
  groups: CatalogGroup[];
  /**
   * The layer's own text, without the info inherited from its groups. Used when
   * a user can't see the layer in the tree, and so must not get the group info.
   */
  ownTextById: Map<string, string | null>;
}

interface WalkedLayer {
  id: string;
  groupId: string;
  groupPath: string[];
  groupInfos: string[];
}

interface WalkedBuiltIn {
  id: string;
  caption: string;
}

export interface WalkedMap {
  tree: WalkedLayer[];
  backgrounds: string[];
  builtInBackgrounds: WalkedBuiltIn[];
  search: string[];
  groups: CatalogGroup[];
}

interface RawGroup {
  id: unknown;
  name?: unknown;
  exclusive?: unknown;
  infogrouptext?: unknown;
  layers?: unknown;
  groups?: unknown;
}

interface RawTool {
  type?: unknown;
  options?: Record<string, unknown>;
}

export interface RawMapConfig {
  tools?: unknown;
  error?: Error;
}

type RawStoreLayer = Record<string, unknown>;
type RawStore = Record<string, unknown> & { error?: Error };

export interface ConfigSource {
  getMapConfig(
    map: string,
    user?: string,
    washContent?: boolean
  ): Promise<RawMapConfig>;
  getLayersStore(user?: string, washContent?: boolean): Promise<RawStore>;
}

// All six are read, so that a new layer type is never silently dropped.
const STORE_ARRAYS: ReadonlyArray<[string, LayerType]> = [
  ["wmslayers", "wms"],
  ["wmtslayers", "wmts"],
  ["wfslayers", "wfs"],
  ["wfstlayers", "wfst"],
  ["vectorlayers", "vector"],
  ["arcgislayers", "arcgis"],
];

// Ids and captions match the client's BACKGROUND_LAYER_IDS and backgroundLayers.js
const BUILT_IN_BACKGROUNDS = [
  { id: "-1", caption: "Vit", option: "backgroundSwitcherWhite" },
  { id: "-2", caption: "Svart", option: "backgroundSwitcherBlack" },
  { id: "-3", caption: "OpenStreetMap", option: "enableOSM" },
  {
    id: "-4",
    caption: "OpenStreetMap (vektor)",
    option: "enableOSMVector",
  },
];

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const decodeEntity = (entity: string, name: string): string => {
  if (name.startsWith("#")) {
    const isHex = name[1] === "x" || name[1] === "X";
    const code = Number.parseInt(name.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }
  return HTML_ENTITIES[name.toLowerCase()] ?? entity;
};

/**
 * @summary Turn a config value into plain text. Strips HTML, keeps paragraph
 * breaks, and converts empty values to null.
 */
export function cleanHtml(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<\/?[a-z!][^>]*>/gi, " ")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text === "" ? null : text;
}

/**
 * @summary Same as cleanHtml, but always on one line. Used for captions and
 * group names, which end up in lists and in the group tree of the prompt.
 */
export function cleanInline(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : cleanHtml(value);
  return text === null ? null : text.replace(/\s+/g, " ");
}

// The store keeps dates as epoch milliseconds, either as a string or a number.
function cleanDate(value: unknown): string | null {
  const text = cleanInline(value);
  if (text === null || !/^\d{10,}$/.test(text)) {
    return text;
  }
  const date = new Date(Number(text));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

// Layers are normally `{ id }` objects, but plain ids are handled as well.
function entryId(entry: unknown): string | null {
  const id =
    typeof entry === "object" && entry !== null
      ? (entry as { id?: unknown }).id
      : entry;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

const entryIds = (entries: unknown): string[] =>
  asArray(entries)
    .map(entryId)
    .filter((id) => id !== null);

function walkGroups(
  groups: unknown,
  parent: Pick<CatalogGroup, "id" | "groupPath"> | null,
  parentInfos: string[],
  out: WalkedMap
): string[] {
  const leaves: string[] = [];

  for (const raw of asArray(groups) as RawGroup[]) {
    const id = String(raw.id);
    const name = cleanInline(raw.name) ?? id;
    const groupPath = [...(parent?.groupPath ?? []), name];
    const info = cleanHtml(raw.infogrouptext);
    const groupInfos = info ? [info, ...parentInfos] : parentInfos;

    const group: CatalogGroup = {
      id,
      name,
      groupPath,
      parentId: parent?.id ?? null,
      exclusive: raw.exclusive === true,
      leafLayerIds: [],
    };
    out.groups.push(group);

    const direct = entryIds(raw.layers);
    for (const layerId of direct) {
      out.tree.push({ id: layerId, groupId: id, groupPath, groupInfos });
    }

    group.leafLayerIds = [
      ...direct,
      ...walkGroups(raw.groups, group, groupInfos, out),
    ];
    leaves.push(...group.leafLayerIds);
  }

  return leaves;
}

/**
 * @summary The one tree walker. Runs both on the raw map config, to build the
 * catalog, and on a user's washed map config, to find out what they may access.
 */
export function walkMapConfig(mapConfig: RawMapConfig): WalkedMap {
  const tools = asArray(mapConfig.tools) as RawTool[];
  const switcher = tools.find((t) => t.type === "layerswitcher")?.options;
  const search = tools.find((t) => t.type === "search")?.options;

  const out: WalkedMap = {
    tree: [],
    backgrounds: entryIds(switcher?.baselayers),
    builtInBackgrounds: BUILT_IN_BACKGROUNDS.filter(
      ({ option }) => switcher?.[option] === true
    ).map(({ id, caption }) => ({ id, caption })),
    search: entryIds(search?.layers),
    groups: [],
  };
  walkGroups(switcher?.groups, null, [], out);

  return out;
}

/**
 * @summary The groups of a walked map, with leaves limited to `knownIds`. The
 * leaves are copied, so the result can be filtered without touching the walk.
 */
export const groupsWithLeaves = (
  groups: CatalogGroup[],
  knownIds: { has(id: string): boolean }
): CatalogGroup[] =>
  groups.map((group) => ({
    ...group,
    leafLayerIds: group.leafLayerIds.filter((id) => knownIds.has(id)),
  }));

function indexStore(
  store: RawStore
): Map<string, { type: LayerType; layer: RawStoreLayer }> {
  const index = new Map<string, { type: LayerType; layer: RawStoreLayer }>();
  for (const [key, type] of STORE_ARRAYS) {
    for (const layer of asArray(store[key]) as RawStoreLayer[]) {
      index.set(String(layer.id), { type, layer });
    }
  }
  return index;
}

function subLayersOf(type: LayerType, layer: RawStoreLayer): SubLayer[] {
  if (type !== "wms") {
    return [];
  }
  const infos = asArray(layer.layersInfo) as RawStoreLayer[];
  return asArray(layer.layers).map((id) => ({
    id: String(id),
    caption: cleanInline(infos.find((info) => info.id === id)?.caption),
  }));
}

const uniqueTexts = (texts: Array<string | null>): string | null =>
  [...new Set(texts.filter((t) => t !== null))].join("\n\n") || null;

/**
 * @summary Merge a map config and the layers store by id. Only layers used by
 * the map become records. The result is a raw catalog that holds every layer
 * regardless of access, so it must never be handed out directly. Requests go
 * through AccessService, which limits it to what the user may see.
 */
export function buildCatalog(
  map: string,
  mapConfig: RawMapConfig,
  store: RawStore
): Catalog {
  const walked = walkMapConfig(mapConfig);
  const storeIndex = indexStore(store);
  const searchable = new Set(walked.search);

  const records: CatalogRecord[] = [];
  const recordsById = new Map<string, CatalogRecord>();
  const ownTextById = new Map<string, string | null>();
  const dangling = new Set<string>();

  const add = (
    id: string,
    role: LayerRole,
    place: WalkedLayer | null
  ): void => {
    if (recordsById.has(id)) {
      // Roles are added in priority order, so the first one wins. The same
      // layer in two tree groups is unexpected and worth a log line though.
      if (place !== null) {
        logger.warn(`Layer "${id}" is in several groups in map "${map}".`);
      }
      return;
    }

    const stored = storeIndex.get(id);
    if (stored === undefined) {
      dangling.add(id);
      return;
    }

    const { type, layer } = stored;
    const subLayers = subLayersOf(type, layer);
    // Same rule as WMSLayer.getLayerType() in the client, which only applies to
    // layers that are on the map. That is why search-only layers don't count.
    const isGroupLayer =
      role === "layer" && type === "wms" && subLayers.length > 1;
    const ownText = cleanHtml(layer.infoText);

    const record: CatalogRecord = {
      id,
      role,
      type,
      isGroupLayer,
      caption: cleanInline(layer.caption) ?? id,
      groupPath: place?.groupPath ?? [],
      groupId: place?.groupId ?? null,
      owner: cleanInline(layer.infoOwner), // The store's `owner` is always empty
      text: uniqueTexts([ownText, ...(place?.groupInfos ?? [])]),
      contentTag: cleanInline(layer.content),
      subLayers,
      subLayersToggleable: isGroupLayer && layer.hideExpandArrow !== true,
      searchable: searchable.has(id),
      infoUrl: cleanInline(layer.infoUrl),
      date: cleanDate(layer.date),
    };
    records.push(record);
    recordsById.set(id, record);
    ownTextById.set(id, ownText);
  };

  walked.tree.forEach((place) => add(place.id, "layer", place));
  walked.backgrounds.forEach((id) => add(id, "background", null));
  walked.search.forEach((id) => add(id, "search", null));

  for (const { id, caption } of walked.builtInBackgrounds) {
    const record: CatalogRecord = {
      id,
      role: "background",
      type: "builtin",
      isGroupLayer: false,
      caption,
      groupPath: [],
      groupId: null,
      owner: null,
      text: null,
      contentTag: null,
      subLayers: [],
      subLayersToggleable: false,
      searchable: false,
      infoUrl: null,
      date: null,
    };
    records.push(record);
    recordsById.set(id, record);
    ownTextById.set(id, null);
  }

  if (dangling.size > 0) {
    logger.warn(
      `Map "${map}" refers to layers missing from the layers store: ${[
        ...dangling,
      ].join(", ")}`
    );
  }

  return {
    map,
    records,
    recordsById,
    groups: groupsWithLeaves(walked.groups, recordsById),
    ownTextById,
  };
}

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
