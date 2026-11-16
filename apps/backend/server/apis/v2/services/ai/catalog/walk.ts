import { cleanHtml, cleanInline } from "./text.ts";
import type {
  CatalogGroup,
  MapTool,
  RawFeatureSource,
  RawGroup,
  RawMapConfig,
  RawPlace,
  RawTool,
  WalkedFeatureSource,
  WalkedMap,
  WalkedPlace,
} from "./types.ts";

/**
 * The plugins the chat can open, through ToolControlModel in the client (see
 * its KNOWN LIMITATIONS). A new plugin needs a line here once that model can
 * show it. The titles mirror the client's defaults, which the prompt needs for
 * a plugin whose map config has no title.
 *
 * Left out on purpose, as the client would show nothing while the model
 * reported success:
 * - `search` and `commandpalette` have no window or dialog, so they aren't
 *   tools (limitation 1).
 * - `location` replaces its window through `custom.render` as a control button
 *   (limitation 2).
 * - `documenthandler` mounts its window as `documentviewer`, and shows nothing
 *   until a document is chosen.
 * - `infodialog` is a dialog per `name`, addressed as `infodialog.<name>`, so
 *   the plugin type alone names none of them.
 * Tools such as `infoclick` and `preset` aren't plugins at all.
 */
export const OPENABLE_PLUGINS: Readonly<Record<string, string>> = {
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

// Ids and captions match the client's BACKGROUND_LAYER_IDS and backgroundLayers.js
export const BUILT_IN_BACKGROUNDS = [
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

export const asArray = (value: unknown): unknown[] =>
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
        presetName: String(raw.name),
      });
    }
  }
  return [...places.values()];
}

// Also what keeps other things in curly brackets, such as CSS, out of the fields
const isFieldName = (name: string): boolean => /^[\p{L}\p{N}_.-]+$/u.test(name);

/** @summary Field names from config, as an array or a comma separated string. */
export function fieldList(value: unknown): string[] {
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
 * @summary The sources the chat may query. The list is opt-in, and the config
 * wash only reaches one level into tool options, so never into this list. Who
 * may query a source is decided in AccessService.
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

/** @returns `[minX, minY, maxX, maxY]`, or null if it isn't one */
function readExtent(value: unknown): number[] | null {
  return Array.isArray(value) &&
    value.length === 4 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    value[0] < value[2] &&
    value[1] < value[3]
    ? (value as number[])
    : null;
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
      extent: readExtent(mapConfig.map?.extent),
      // On unless the aichat tool turns it off
      drawnFeatures: aichat?.drawnFeatures !== false,
      // Off unless the aichat tool turns it on
      suggestions: aichat?.suggestions === true,
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
