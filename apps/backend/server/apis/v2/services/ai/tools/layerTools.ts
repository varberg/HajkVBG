import type { UserCatalog } from "../access.service.ts";
import type { CatalogRecord, LayerRole } from "../catalog.service.ts";
import { LOCALE, collator } from "../locale.ts";
import { PAGE_SIZE, ToolError, readOffset } from "../toolSupport.ts";
import type { Rejection } from "../toolSupport.ts";
import type { PresentedLayer } from "./events.ts";
import {
  allowedGroup,
  presentedItem,
  resolveTargets,
  turnOff,
  turnOn,
} from "./layerTargets.ts";
import {
  define,
  idList,
  nullableEnum,
  object,
  offsetSchema,
} from "./schema.ts";
import type { Tool } from "./types.ts";

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 25;
const MAX_PRESENTED = 25;

const pathText = (groupPath: string[]) => groupPath.join(" > ");

const listItem = (record: CatalogRecord) => ({
  id: record.id,
  caption: record.caption,
  groupPath: pathText(record.groupPath),
  role: record.role,
});

// Ids break the ties, so that pages never repeat or skip a layer
const byPlace = (a: CatalogRecord, b: CatalogRecord): number =>
  collator.compare(pathText(a.groupPath), pathText(b.groupPath)) ||
  collator.compare(a.caption, b.caption) ||
  collator.compare(a.id, b.id);

function page<T>(items: T[], offset: number) {
  const slice = items.slice(offset, offset + PAGE_SIZE);
  return {
    total: items.length,
    truncated: offset + slice.length < items.length,
    offset,
    items: slice,
  };
}

interface LayerFilters {
  owner: string | null;
  role: LayerRole | null;
  group_id: string | null;
}

function filterRecords(
  filters: LayerFilters,
  userCatalog: UserCatalog
): CatalogRecord[] {
  const { owner, role, group_id: groupId } = filters;
  const inGroup =
    groupId === null
      ? null
      : new Set(allowedGroup(userCatalog, groupId).leafLayerIds);
  const ownerText = owner?.toLocaleLowerCase(LOCALE);

  return userCatalog.records.filter(
    (record) =>
      (ownerText === undefined ||
        record.owner?.toLocaleLowerCase(LOCALE).includes(ownerText) === true) &&
      // A place isn't a layer, so it only counts when asked for by name
      (role === null ? record.role !== "place" : record.role === role) &&
      (inGroup === null || inGroup.has(record.id))
  );
}

/** Find, list and show layers, and turn them on and off. */
export const layerTools: Tool[] = [
  define<{ query: string; limit: number }>({
    name: "search_layers",
    kind: "read",
    description:
      "Search the layers and named places of the map by meaning and keywords, in Swedish. Use it for questions about a subject, and to find a place, which has the role `place`. Returns the best matches only, so a layer that isn't listed can still exist.",
    inputSchema: object({
      query: {
        type: "string",
        description:
          "Search terms, preferably words likely to be used in the layer names and descriptions.",
      },
      limit: {
        type: "integer",
        description: `How many matches to return, at most ${MAX_SEARCH_LIMIT}. Use ${DEFAULT_SEARCH_LIMIT} unless you need more.`,
      },
    }),
    async run({ query, limit }, { userCatalog, search }) {
      if (limit < 1) {
        throw new ToolError("limit must be at least 1.");
      }
      const { hits } = await search.search(
        userCatalog,
        query,
        Math.min(limit, MAX_SEARCH_LIMIT)
      );
      return { result: { layers: hits.map((h) => listItem(h.record)) } };
    },
  }),

  define<{
    filters: LayerFilters;
    count_only: boolean;
    offset: number;
  }>({
    name: "filter_layers",
    kind: "read",
    description: `List or count layers by exact criteria, such as how many layers an owner has. All filters must match, and null means no filter. Returns ${PAGE_SIZE} layers per page, with \`total\` and \`truncated\`.`,
    inputSchema: object({
      filters: object({
        owner: {
          type: ["string", "null"],
          description:
            "Part of the owner's name, ignoring case. Owners are often written in another form than the user's, so use a short distinctive part, such as `stadsbyggnad`, and try another one before saying that an owner has no layers.",
        },
        role: nullableEnum(
          ["layer", "background", "search", "place"],
          "`layer` is in the layer tree, `background` is a background, `search` is only used in Search and `place` is a named place. Places are only included when this is `place`."
        ),
        group_id: {
          type: ["string", "null"],
          description:
            "A group id, to list what a group holds. Includes layers in its subgroups, and `groupPath` says where each one is.",
        },
      }),
      count_only: {
        type: "boolean",
        description: "True returns only `total`.",
      },
      offset: offsetSchema,
    }),
    run({ filters, count_only: countOnly, offset }, { userCatalog }) {
      const start = readOffset(offset);
      const records = filterRecords(filters, userCatalog);
      if (countOnly) {
        return { result: { total: records.length } };
      }
      const { items, ...rest } = page([...records].sort(byPlace), start);
      return { result: { ...rest, layers: items.map(listItem) } };
    },
  }),

  define<{ id: string }>({
    name: "get_layer_details",
    kind: "read",
    description:
      'Get everything known about one layer, such as its description, owner and sublayers. A sublayer of a layer with `subLayersToggleable` is addressed as "layerId:subLayerId".',
    inputSchema: object({ id: { type: "string", description: "A layer id." } }),
    run({ id }, { userCatalog }) {
      const record = userCatalog.recordsById.get(id);
      if (record === undefined) {
        throw new ToolError(`Unknown layer id "${id}".`);
      }
      return { result: record };
    },
  }),

  define<{ ids: string[] }>({
    name: "present_layers",
    kind: "action",
    description: `Show layers under your answer, with controls that let the user turn them on and off. Pick only what answers the question, at most ${MAX_PRESENTED}. Takes layer ids, group ids, sublayer addresses and place ids, and a place gets a button that moves the map there.`,
    inputSchema: object({ ids: idList("The ids to show, in display order.") }),
    run({ ids }, { userCatalog }) {
      const unique = [...new Set(ids)];
      const items: PresentedLayer[] = [];
      const rejected: Rejection[] = unique.slice(MAX_PRESENTED).map((id) => ({
        id,
        reason: `At most ${MAX_PRESENTED} can be shown.`,
      }));

      for (const id of unique.slice(0, MAX_PRESENTED)) {
        const item = presentedItem(id, userCatalog);
        if (typeof item === "string") {
          rejected.push({ id, reason: item });
        } else {
          items.push(item);
        }
      }
      return {
        result: { shown: items.length, rejected },
        events: items.length > 0 ? [{ type: "layers", items }] : [],
      };
    },
  }),

  define<{ ids: string[]; visible: boolean }>({
    name: "set_layer_visibility",
    kind: "action",
    description:
      'Turn layers on or off on the map. Takes layer ids, group ids, which cover everything below the group, and "layerId:subLayerId" sublayer addresses. Backgrounds aren\'t accepted, use set_background. Only one direct layer of an exclusive group can be on, also when a group above it is turned on: `shownInExclusiveFolders` says which one, and `hiddenSiblings` lists the layers that get hidden because of that. There is a limit on how many layers can be turned on at once, but none for turning them off. Always check `accepted` and `rejected` before telling the user what happened.',
    inputSchema: object({
      ids: idList("The ids to change."),
      visible: { type: "boolean", description: "True is on, false is off." },
    }),
    run({ ids, visible }, context) {
      const { targets, rejected } = resolveTargets(ids, context.userCatalog);
      const outcome = visible
        ? turnOn(targets, rejected, context)
        : turnOff(targets, context);
      const { accepted } = outcome;

      return {
        result: { visible, ...outcome, rejected },
        events:
          accepted.length > 0
            ? [
                {
                  type: "action",
                  action: "set_layer_visibility",
                  ids: accepted,
                  visible,
                },
              ]
            : [],
      };
    },
  }),
];
