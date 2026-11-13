import log4js from "log4js";

import { cleanDate, cleanHtml, cleanInline } from "./text.ts";
import type {
  Catalog,
  CatalogGroup,
  CatalogRecord,
  FeatureConnection,
  LayerRole,
  LayerType,
  RawMapConfig,
  RawStore,
  RawStoreLayer,
  SubLayer,
  WalkedLayer,
  WalkedMap,
} from "./types.ts";
import { asArray, fieldList, walkMapConfig } from "./walk.ts";

const logger = log4js.getLogger("service.ai.catalog");

// All six are read, so that a new layer type is never silently dropped.
const STORE_ARRAYS: ReadonlyArray<[string, LayerType]> = [
  ["wmslayers", "wms"],
  ["wmtslayers", "wmts"],
  ["wfslayers", "wfs"],
  ["wfstlayers", "wfst"],
  ["vectorlayers", "vector"],
  ["arcgislayers", "arcgis"],
];

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

export function indexStore(
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
export function toConnection(
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
    caption: cleanInline(layer.caption) ?? String(layer.id),
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
 * be a WFS layer, as other layers in Search have no search config. It doesn't
 * have to be in Search, so that a source can be for the chat only.
 */
export function buildFeatureConnections(
  map: string,
  walked: WalkedMap,
  storeIndex: ReturnType<typeof indexStore>
): Map<string, FeatureConnection> {
  const connections = new Map<string, FeatureConnection>();

  for (const { id } of walked.featureSources) {
    const stored = storeIndex.get(id);
    const connection =
      stored?.type === "wfs"
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
      // Roles are added in priority order, so the first one wins, also for a
      // layer that is in several tree groups.
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
