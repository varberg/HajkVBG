import type { WfsTarget } from "../features/wfsClient.ts";

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
  /**
   * Places only: the name exactly as in the map config, which the client looks
   * the place up by. The caption is cleaned, so it can differ.
   */
  presetName?: string;
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
  caption: string;
  /** May hold labels, see isDisplayLabel. */
  displayFields: string[];
  infobox: string | null;
}

export interface WalkedLayer {
  id: string;
  groupId: string;
  groupPath: string[];
  groupInfos: string[];
}

export interface WalkedBuiltIn {
  id: string;
  caption: string;
}

export interface WalkedPlace {
  id: string;
  caption: string;
  groupPath: string[];
  changesLayers: boolean;
  presetName: string;
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
 * sources of the `aichat` tool, see walkFeatureSources, and whether it takes
 * drawn features.
 */
export interface MapInfo {
  title: string | null;
  projection: string | null;
  /** The map's extent in its projection, if the config has a valid one */
  extent: number[] | null;
  /** Whether users may share what they drew with the chat, see drawn.ts */
  drawnFeatures: boolean;
  /** Whether answers end with follow-up questions, see suggestionTools.ts */
  suggestions: boolean;
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

export interface RawGroup {
  id: unknown;
  name?: unknown;
  exclusive?: unknown;
  infogrouptext?: unknown;
  layers?: unknown;
  groups?: unknown;
}

export interface RawTool {
  type?: unknown;
  options?: Record<string, unknown>;
}

export interface RawPlace {
  name?: unknown;
  presetUrl?: unknown;
}

export interface RawFeatureSource {
  id?: unknown;
  description?: unknown;
  extraFields?: unknown;
}

export interface RawMapConfig {
  map?: { title?: unknown; projection?: unknown; extent?: unknown };
  tools?: unknown;
  error?: Error;
}

export type RawStoreLayer = Record<string, unknown>;
export type RawStore = Record<string, unknown> & { error?: Error };

export interface ConfigSource {
  getMapConfig(
    map: string,
    user?: string,
    washContent?: boolean
  ): Promise<RawMapConfig>;
  getLayersStore(user?: string, washContent?: boolean): Promise<RawStore>;
}
