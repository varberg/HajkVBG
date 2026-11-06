import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import log4js from "log4js";

import configService from "../config.service.js";
import { validateMapName } from "../../utils/safePath.js";
import type { WfsTarget } from "./features/wfsClient.ts";

const logger = log4js.getLogger("service.ai.catalog");

/**
 * The plugins the chat can open, with the title each shows when the map config
 * has none, as the real defaults live in the client. A new plugin needs a line
 * here, once `<type>.showWindow` is known to show something.
 *
 * Left out on purpose, because the client would do nothing and the model would
 * still report success: `search` and `commandpalette` don't listen to the event,
 * `location` has no window as a control button, `documenthandler` listens as
 * `documentviewer` and `infodialog` as `infodialog.<name>`. Tools such as
 * `infoclick` and `preset` aren't plugins at all.
 */
const OPENABLE_PLUGINS: Readonly<Record<string, string>> = {
  anchor: "Dela",
  attributeeditor: "Attributredigerare",
  bookmarks: "Bokmärken",
  buffer: "Buffra",
  collector: "Tyck till",
  coordinates: "Visa koordinat",
  edit: "Redigera",
  export: "Exportera",
  feedback: "Tyck till",
  fir: "FIR",
  floodsimulator: "Översvämning",
  fmeserver: "FME-server",
  geosuiteexport: "Hämta data",
  informative: "Översiktsplan",
  kir: "KIR",
  layercomparer: "Lagerjämförare",
  layerswitcher: "Visa",
  measurer: "Mät",
  print: "Skriv ut",
  propertychecker: "Fastighetskontroll",
  routing: "Navigation",
  sketch: "Rita",
  streetview: "Gatuvy",
  timeslider: "Tidslinje",
};

// The client doesn't mount a plugin without one of these, and `hidden` means
// that the button was hidden on purpose.
const VISIBLE_TARGETS: unknown[] = ["toolbar", "left", "right", "control"];

export type LayerRole = "layer" | "background" | "search" | "place";

export type LayerType =
  "wms" | "wmts" | "wfs" | "wfst" | "vector" | "arcgis" | "builtin" | "place";

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
  /** Places only: going there also replaces the layers on the map. */
  changesLayers?: boolean;
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
  /**
   * How to reach the feature sources. This holds URLs, so it's kept apart from
   * the records, and from UserCatalog, and only the WFS tools may read it.
   */
  featureConnections: Map<string, FeatureConnection>;
}

export interface FeatureConnection extends WfsTarget {
  /** May hold labels, see isDisplayLabel. */
  displayFields: string[];
  infobox: string | null;
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

interface WalkedPlace {
  id: string;
  caption: string;
  groupPath: string[];
  changesLayers: boolean;
}

export interface WalkedFeatureSource {
  id: string;
  description: string | null;
  extraFields: string[];
}

/**
 * What the chat may tell about a map. Tool options are left out on purpose, as
 * some tools carry restricted configuration. The exceptions are the names of the
 * `preset` tool's places, which become records, see walkPlaces, and the feature
 * sources of the `aichat` tool, see walkFeatureSources.
 */
export interface MapInfo {
  title: string | null;
  projection: string | null;
  tools: MapTool[];
}

export interface MapTool {
  type: string;
  title: string;
  /** Whether the chat can open it, see OPENABLE_PLUGINS. */
  openable: boolean;
}

export interface WalkedMap {
  info: MapInfo;
  tree: WalkedLayer[];
  backgrounds: string[];
  builtInBackgrounds: WalkedBuiltIn[];
  places: WalkedPlace[];
  search: string[];
  featureSources: WalkedFeatureSource[];
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

interface RawPlace {
  name?: unknown;
  presetUrl?: unknown;
}

interface RawFeatureSource {
  id?: unknown;
  description?: unknown;
  extraFields?: unknown;
}

export interface RawMapConfig {
  map?: { title?: unknown; projection?: unknown };
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

// A colon can't be mistaken for a sublayer address, as records are looked up first
const PLACE_ID_PREFIX = "place:";
// Same default title as PresetLinks
const DEFAULT_PLACES_TITLE = "Snabbval";

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

/** @summary What the chat may tell about a tool. Most have no title of their own. */
function toMapTool({ type, options }: RawTool): MapTool {
  // The client matches tools by lowercase type, and listens for that too
  const name = (type as string).toLowerCase();
  const fallback = Object.hasOwn(OPENABLE_PLUGINS, name)
    ? OPENABLE_PLUGINS[name]
    : undefined;
  return {
    type: name,
    title: cleanInline(options?.title) ?? fallback ?? name,
    openable:
      fallback !== undefined && VISIBLE_TARGETS.includes(options?.target),
  };
}

/**
 * @summary The named places of the `preset` tool. Only the name is kept, as the
 * client has the link in its own map config, and a broken link is left out so
 * that the chat never offers it. Same rule as isValidMapLink() in PresetLinks.
 */
function walkPlaces(options: RawTool["options"]): WalkedPlace[] {
  const groupPath = [cleanInline(options?.title) ?? DEFAULT_PLACES_TITLE];
  const places = new Map<string, WalkedPlace>();

  for (const raw of asArray(options?.presetList) as RawPlace[]) {
    const caption = cleanInline(raw.name);
    const url =
      typeof raw.presetUrl === "string" ? raw.presetUrl.toLowerCase() : "";
    const valid =
      (url.includes("x=") && url.includes("y=")) || url.includes("l=");

    if (caption !== null && valid && !places.has(caption)) {
      places.set(caption, {
        id: `${PLACE_ID_PREFIX}${caption}`,
        caption,
        groupPath,
        changesLayers: Boolean(new URLSearchParams(url).get("l")),
      });
    }
  }
  return [...places.values()];
}

// Also what keeps other things in curly brackets, such as CSS, out of the fields
const isFieldName = (name: string): boolean => /^[\p{L}\p{N}_.-]+$/u.test(name);

/** @summary Field names from config, as an array or a comma separated string. */
function fieldList(value: unknown): string[] {
  const names = typeof value === "string" ? value.split(",") : asArray(value);
  return names
    .filter((name) => typeof name === "string")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

/** @summary A display field in double quotes is text to show, not a field. */
export const isDisplayLabel = (displayField: string): boolean =>
  /^".*"$/.test(displayField);

/**
 * @summary The fields an infobox shows. A placeholder can go on with a format or
 * a plugin, as in `{adat|date}` and `{url@@documenthandler}`, and double curly
 * brackets are conditions, not placeholders.
 */
export function infoboxFields(infobox: string | null): string[] {
  return [...(infobox ?? "").matchAll(/(?<!{){([^{}]*)}(?!})/g)]
    .map(([, placeholder]) => placeholder.split(/\||@@/)[0].trim())
    .filter(isFieldName);
}

/**
 * @summary The sources the chat may query. The list is opt-in, and being on it
 * gives no access: that still comes from `allowed.search`, as the config wash
 * only reaches one level into tool options, and so never into this list.
 */
function walkFeatureSources(
  options: RawTool["options"]
): WalkedFeatureSource[] {
  const sources = new Map<string, WalkedFeatureSource>();

  for (const raw of asArray(options?.featureSources) as RawFeatureSource[]) {
    const id = entryId(raw);
    if (id !== null) {
      sources.set(id, {
        id,
        description: cleanInline(raw.description),
        extraFields: fieldList(raw.extraFields).filter(isFieldName),
      });
    }
  }
  return [...sources.values()];
}

/**
 * @summary The one tree walker. Runs both on the raw map config, to build the
 * catalog, and on a user's washed map config, to find out what they may access.
 */
export function walkMapConfig(mapConfig: RawMapConfig): WalkedMap {
  const tools = asArray(mapConfig.tools) as RawTool[];
  const switcher = tools.find((t) => t.type === "layerswitcher")?.options;
  const search = tools.find((t) => t.type === "search")?.options;
  const preset = tools.find((t) => t.type === "preset")?.options;
  const aichat = tools.find((t) => t.type === "aichat")?.options;

  const out: WalkedMap = {
    info: {
      title: cleanInline(mapConfig.map?.title),
      projection: cleanInline(mapConfig.map?.projection),
      tools: tools.filter((t) => typeof t.type === "string").map(toMapTool),
    },
    tree: [],
    backgrounds: entryIds(switcher?.baselayers),
    builtInBackgrounds: BUILT_IN_BACKGROUNDS.filter(
      ({ option }) => switcher?.[option] === true
    ).map(({ id, caption }) => ({ id, caption })),
    places: walkPlaces(preset),
    search: entryIds(search?.layers),
    featureSources: walkFeatureSources(aichat),
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

// What is left of a record that has no layer in the store
const EMPTY_RECORD = {
  isGroupLayer: false,
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

/**
 * @summary How to reach a source, or null if it can't be queried. A source needs
 * search fields, as in Search, and a single feature type: Search can query
 * several, and using only one of them would quietly give part of the answer.
 */
function toConnection(
  layer: RawStoreLayer,
  srsName: string | null
): FeatureConnection | null {
  const typeNames = asArray(layer.layers);
  const searchFields = fieldList(layer.searchFields);
  if (
    typeof layer.url !== "string" ||
    typeNames.length !== 1 ||
    typeof typeNames[0] !== "string" ||
    searchFields.length === 0 ||
    srsName === null
  ) {
    return null;
  }
  return {
    url: layer.url,
    typeName: typeNames[0],
    // Same default as SearchModel.js in the client
    geometryField:
      typeof layer.geometryField === "string" && layer.geometryField !== ""
        ? layer.geometryField
        : "geom",
    srsName,
    searchFields,
    displayFields: fieldList(layer.displayFields),
    infobox: typeof layer.infobox === "string" ? layer.infobox : null,
  };
}

/**
 * @summary The connections of a map. Listing a source isn't enough: it must also
 * be a WFS layer and be in Search, as other layers in Search have no search
 * config, and what admins left out of Search must stay out of the chat.
 */
function buildFeatureConnections(
  map: string,
  walked: WalkedMap,
  storeIndex: ReturnType<typeof indexStore>
): Map<string, FeatureConnection> {
  const connections = new Map<string, FeatureConnection>();

  for (const { id } of walked.featureSources) {
    const stored = storeIndex.get(id);
    const usable = stored?.type === "wfs" && walked.search.includes(id);
    const connection = usable
      ? toConnection(stored.layer, walked.info.projection)
      : null;

    if (connection === null) {
      logger.warn(`Feature source "${id}" can't be used in map "${map}".`);
    } else {
      connections.set(id, connection);
    }
  }
  return connections;
}

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

  const addWithoutStore = (record: CatalogRecord): void => {
    records.push(record);
    recordsById.set(record.id, record);
    ownTextById.set(record.id, null);
  };

  for (const { id, caption } of walked.builtInBackgrounds) {
    addWithoutStore({
      ...EMPTY_RECORD,
      id,
      role: "background",
      type: "builtin",
      caption,
    });
  }

  for (const place of walked.places) {
    addWithoutStore({
      ...EMPTY_RECORD,
      ...place,
      role: "place",
      type: "place",
    });
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
    featureConnections: buildFeatureConnections(map, walked, storeIndex),
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
