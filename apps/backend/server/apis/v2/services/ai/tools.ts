import log4js from "log4js";

import {
  isSubLayerAddressAllowed,
  parseSubLayerAddress,
} from "./access.service.ts";
import type { UserCatalog } from "./access.service.ts";
import type {
  CatalogGroup,
  CatalogRecord,
  LayerRole,
  LayerType,
  SubLayer,
} from "./catalog.service.ts";
import type { SearchService } from "./search/search.service.ts";

const logger = log4js.getLogger("service.ai.tools");

export const PAGE_SIZE = 25;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 25;
const MAX_PRESENTED = 25;

// The same answer for a layer that doesn't exist and one the user can't reach,
// so that a rejection never confirms that a restricted layer is there.
const NOT_FOUND = "Unknown id.";

/**
 * The subset of JSON Schema that both providers' strict modes accept. Claude
 * rejects `minimum`, `maxItems`, `minLength` and the like with a 400, so bounds
 * are checked in the tools instead. Every property is required, and optional
 * values are nullable.
 */
export interface JsonSchema {
  type: string | string[];
  description?: string;
  enum?: Array<string | null>;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
}

/**
 * `read` tools have no side effects and may run in parallel, and can be reused
 * by MCP later. `action` tools reach the browser through events, so they run in
 * order and are never exposed outside the chat.
 */
export type ToolKind = "read" | "action";

export interface ToolDefinition {
  name: string;
  description: string;
  kind: ToolKind;
  inputSchema: JsonSchema;
}

export type LayerControl = "toggle" | "background" | "none";

export interface PresentedLayer {
  /** Null for search-only layers, which have nothing to control on the map. */
  id: string | null;
  caption: string;
  groupPath: string[];
  control: LayerControl;
}

export type ToolEvent =
  | { type: "layers"; items: PresentedLayer[] }
  | {
      type: "action";
      action: "set_layer_visibility";
      ids: string[];
      visible: boolean;
    }
  | { type: "action"; action: "set_background"; id: string };

export interface ToolContext {
  userCatalog: UserCatalog;
  search: Pick<SearchService, "search">;
  maxLayersOn: number;
  /** The layers on the map, kept up to date by the actions of the turn. */
  visibleLayers: Set<string>;
}

interface ToolOutput {
  result: unknown;
  events?: ToolEvent[];
}

export interface Tool extends ToolDefinition {
  run(input: unknown, context: ToolContext): Promise<ToolOutput> | ToolOutput;
}

export interface ToolRun {
  /** The result as JSON, ready to hand to the model. */
  content: string;
  isError: boolean;
  events: ToolEvent[];
}

/** An error meant for the model, which can correct itself and try again. */
class ToolError extends Error {}

const typeOf = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return Number.isInteger(value) ? "integer" : typeof value;
};

/**
 * @summary Check a value against a tool schema.
 * @description Strict mode makes the providers follow the schema, but the input
 * still comes from a model, and not every provider or gateway enforces it.
 * @returns What is wrong, or null if the value is valid
 */
export function validateInput(
  schema: JsonSchema,
  value: unknown,
  path = "input"
): string | null {
  const actual = typeOf(value);
  if (![schema.type].flat().includes(actual)) {
    return `${path} must be of type ${[schema.type].flat().join(" or ")}.`;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value as string)) {
    return `${path} must be one of: ${schema.enum.join(", ")}.`;
  }
  if (actual === "array" && schema.items !== undefined) {
    for (const [index, item] of (value as unknown[]).entries()) {
      const problem = validateInput(schema.items, item, `${path}[${index}]`);
      if (problem !== null) return problem;
    }
  }
  if (actual === "object" && schema.properties !== undefined) {
    const object = value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      if (schema.properties[key] === undefined) {
        return `${path}.${key} is not a known property.`;
      }
    }
    for (const [key, property] of Object.entries(schema.properties)) {
      if (!(key in object)) return `${path}.${key} is missing.`;
      const problem = validateInput(property, object[key], `${path}.${key}`);
      if (problem !== null) return problem;
    }
  }
  return null;
}

const object = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const nullableEnum = (values: string[], description: string): JsonSchema => ({
  type: ["string", "null"],
  enum: [...values, null],
  description,
});

const idList = (description: string): JsonSchema => ({
  type: "array",
  items: { type: "string" },
  description,
});

const offsetSchema: JsonSchema = {
  type: ["integer", "null"],
  description: "How many items to skip, to fetch a later page. Null means 0.",
};

const pathText = (groupPath: string[]) => groupPath.join(" > ");

const listItem = (record: CatalogRecord) => ({
  id: record.id,
  caption: record.caption,
  groupPath: pathText(record.groupPath),
  role: record.role,
});

const collator = new Intl.Collator("sv");

// Ids break the ties, so that pages never repeat or skip a layer
const byPlace = (a: CatalogRecord, b: CatalogRecord): number =>
  collator.compare(pathText(a.groupPath), pathText(b.groupPath)) ||
  collator.compare(a.caption, b.caption) ||
  collator.compare(a.id, b.id);

function readOffset(offset: number | null): number {
  if (offset !== null && offset < 0) {
    throw new ToolError("offset can't be negative.");
  }
  return offset ?? 0;
}

function page<T>(items: T[], offset: number) {
  const slice = items.slice(offset, offset + PAGE_SIZE);
  return {
    total: items.length,
    truncated: offset + slice.length < items.length,
    offset,
    items: slice,
  };
}

function allowedGroup(userCatalog: UserCatalog, id: string): CatalogGroup {
  const group = userCatalog.groupsById.get(id);
  if (group === undefined) {
    throw new ToolError(`Unknown group id "${id}".`);
  }
  return group;
}

const directLayers = (
  group: CatalogGroup,
  userCatalog: UserCatalog
): CatalogRecord[] =>
  group.leafLayerIds
    .map((id) => userCatalog.recordsById.get(id))
    .filter((record) => record?.groupId === group.id) as CatalogRecord[];

type Lookup =
  | { kind: "layer"; record: CatalogRecord }
  | { kind: "background"; record: CatalogRecord }
  | { kind: "search"; record: CatalogRecord }
  | { kind: "subLayer"; parent: CatalogRecord; subLayer: SubLayer }
  | { kind: "folder"; group: CatalogGroup }
  | { kind: "none"; reason: string };

/**
 * @summary Find out what an id refers to, in the same order as the client's
 * LayerControlModel: a whole layer id, then a sublayer address, then a folder.
 */
function lookup(id: string, userCatalog: UserCatalog): Lookup {
  const record = userCatalog.recordsById.get(id);
  if (record !== undefined) {
    return { kind: record.role, record } as Lookup;
  }

  const parsed = parseSubLayerAddress(userCatalog, id);
  const parent =
    parsed !== null && userCatalog.allowed.layers.has(parsed.layerId)
      ? userCatalog.recordsById.get(parsed.layerId)
      : undefined;
  if (parent?.isGroupLayer) {
    if (isSubLayerAddressAllowed(userCatalog, id)) {
      const subLayer = parent.subLayers.find(
        (s) => s.id === parsed?.subLayerId
      );
      return { kind: "subLayer", parent, subLayer: subLayer as SubLayer };
    }
    return {
      kind: "none",
      reason: parent.subLayersToggleable
        ? "The layer has no such sublayer."
        : "The sublayers of this layer can't be toggled one by one.",
    };
  }
  if (parent !== undefined) {
    return { kind: "none", reason: "The layer has no sublayers to toggle." };
  }

  const group = userCatalog.groupsById.get(id);
  return group !== undefined
    ? { kind: "folder", group }
    : { kind: "none", reason: NOT_FOUND };
}

type Target = Extract<Lookup, { kind: "layer" | "subLayer" | "folder" }>;

interface Rejection {
  id: string;
  reason: string;
}

/**
 * @summary The direct child of an exclusive group that a target would turn on.
 * Exclusive groups only apply to direct layer children, the same as in the
 * client, and an exclusive folder shows its first direct layer.
 */
function exclusiveSlot(
  target: Target,
  userCatalog: UserCatalog
): { group: CatalogGroup; childId: string } | null {
  if (target.kind === "folder") {
    const { group } = target;
    const first = directLayers(group, userCatalog)[0];
    return group.exclusive && first !== undefined
      ? { group, childId: first.id }
      : null;
  }
  const record = target.kind === "layer" ? target.record : target.parent;
  const group = userCatalog.groupsById.get(record.groupId ?? "");
  return group?.exclusive ? { group, childId: record.id } : null;
}

/** @returns What a target counts as against the cap on turning layers on */
function leavesOf(id: string, target: Target, userCatalog: UserCatalog) {
  if (target.kind !== "folder") {
    return [id];
  }
  return target.group.exclusive
    ? directLayers(target.group, userCatalog)
        .slice(0, 1)
        .map((record) => record.id)
    : target.group.leafLayerIds;
}

function resolveTargets(ids: string[], userCatalog: UserCatalog) {
  const targets = new Map<string, Target>();
  const rejected: Rejection[] = [];

  for (const id of new Set(ids)) {
    const found = lookup(id, userCatalog);
    if (found.kind === "background") {
      rejected.push({
        id,
        reason: "This is a background, use set_background.",
      });
    } else if (found.kind === "search") {
      rejected.push({
        id,
        reason: "This layer is only used in Search, it isn't a map layer.",
      });
    } else if (found.kind === "none") {
      rejected.push({ id, reason: found.reason });
    } else {
      targets.set(id, found);
    }
  }
  return { targets, rejected };
}

function turnOn(
  targets: Map<string, Target>,
  rejected: Rejection[],
  { userCatalog, maxLayersOn, visibleLayers }: ToolContext
) {
  // For an exclusive group, the last child asked for is the one that stays on
  const winners = new Map<string, string>();
  for (const target of targets.values()) {
    const slot = exclusiveSlot(target, userCatalog);
    if (slot !== null) {
      winners.set(slot.group.id, slot.childId);
    }
  }

  const accepted: string[] = [];
  const counted = new Set<string>();

  for (const [id, target] of targets) {
    const slot = exclusiveSlot(target, userCatalog);
    if (slot !== null && winners.get(slot.group.id) !== slot.childId) {
      rejected.push({
        id,
        reason: `Only one layer can be on in the exclusive group "${slot.group.name}", the last one asked for was kept.`,
      });
      continue;
    }

    const leaves = leavesOf(id, target, userCatalog);
    if (leaves.length === 0) {
      rejected.push({
        id,
        reason:
          "This exclusive group has no layers of its own, pick one of its subgroups.",
      });
      continue;
    }

    const added = leaves.filter((leaf) => !counted.has(leaf));
    if (counted.size + added.length > maxLayersOn) {
      rejected.push({
        id,
        reason: `This would turn on ${added.length} layers, and at most ${maxLayersOn} can be turned on at once (${counted.size} already accepted in this call).`,
      });
      continue;
    }
    added.forEach((leaf) => counted.add(leaf));
    accepted.push(id);
  }

  // Only accepted targets hide anything, as the cap can reject a winner. Direct
  // children are what the client hides, so those are the ones to report.
  const slots = new Map(
    accepted.flatMap((id) => {
      const slot = exclusiveSlot(targets.get(id) as Target, userCatalog);
      return slot === null ? [] : ([[slot.group.id, slot]] as const);
    })
  );
  const hiddenSiblings = [...slots.values()].flatMap(({ group, childId }) =>
    directLayers(group, userCatalog)
      .filter((r) => r.id !== childId && visibleLayers.has(r.id))
      .map((r) => ({ id: r.id, caption: r.caption, group: group.name }))
  );

  const shownInExclusiveFolders = accepted.flatMap((id) => {
    const target = targets.get(id) as Target;
    const slot = exclusiveSlot(target, userCatalog);
    return target.kind === "folder" && slot !== null
      ? [{ folderId: id, shownLayerId: slot.childId }]
      : [];
  });

  for (const id of accepted) {
    const target = targets.get(id) as Target;
    for (const leaf of leavesOf(id, target, userCatalog)) {
      visibleLayers.add(target.kind === "subLayer" ? target.parent.id : leaf);
    }
  }
  hiddenSiblings.forEach(({ id }) => visibleLayers.delete(id));

  return { accepted, hiddenSiblings, shownInExclusiveFolders };
}

function turnOff(
  targets: Map<string, Target>,
  { userCatalog, visibleLayers }: ToolContext
) {
  for (const [id, target] of targets) {
    // Other sublayers can stay on, so a sublayer says nothing about its parent
    if (target.kind !== "subLayer") {
      leavesOf(id, target, userCatalog).forEach((leaf) =>
        visibleLayers.delete(leaf)
      );
    }
    if (target.kind === "folder") {
      target.group.leafLayerIds.forEach((leaf) => visibleLayers.delete(leaf));
    }
  }
  return { accepted: [...targets.keys()] };
}

function presentedItem(
  id: string,
  userCatalog: UserCatalog
): PresentedLayer | string {
  const found = lookup(id, userCatalog);
  switch (found.kind) {
    case "layer":
    case "background":
    case "search": {
      const { caption, groupPath } = found.record;
      return found.kind === "search"
        ? { id: null, caption, groupPath, control: "none" }
        : {
            id,
            caption,
            groupPath,
            control: found.kind === "layer" ? "toggle" : "background",
          };
    }
    case "subLayer":
      return {
        id,
        caption: found.subLayer.caption ?? found.subLayer.id,
        groupPath: [...found.parent.groupPath, found.parent.caption],
        control: "toggle",
      };
    case "folder":
      return {
        id,
        caption: found.group.name,
        groupPath: found.group.groupPath.slice(0, -1),
        control: "toggle",
      };
    default:
      return found.reason;
  }
}

function define<Input>(
  tool: ToolDefinition & {
    run(input: Input, context: ToolContext): Promise<ToolOutput> | ToolOutput;
  }
): Tool {
  return tool as Tool;
}

interface LayerFilters {
  owner: string | null;
  type: LayerType | null;
  role: LayerRole | null;
  group_id: string | null;
  missing: Array<"owner" | "text" | "contentTag" | "infoUrl" | "date"> | null;
}

function filterRecords(
  filters: LayerFilters,
  userCatalog: UserCatalog
): CatalogRecord[] {
  const { owner, type, role, group_id: groupId, missing } = filters;
  const inGroup =
    groupId === null
      ? null
      : new Set(allowedGroup(userCatalog, groupId).leafLayerIds);
  const ownerText = owner?.toLocaleLowerCase("sv");

  return userCatalog.records.filter(
    (record) =>
      (ownerText === undefined ||
        record.owner?.toLocaleLowerCase("sv").includes(ownerText) === true) &&
      (type === null || record.type === type) &&
      (role === null || record.role === role) &&
      (inGroup === null || inGroup.has(record.id)) &&
      (missing ?? []).every((field) => record[field] === null)
  );
}

/**
 * The tools of the chat. Independent of transport and provider, and the order
 * is fixed, because a changed tool list breaks the prompt cache.
 */
export const tools: Tool[] = [
  define<{ query: string; limit: number | null }>({
    name: "search_layers",
    kind: "read",
    description:
      "Search the layers of the map by meaning and keywords, in Swedish. Use it for questions about a subject. Returns the best matches only, so a layer that isn't listed can still exist.",
    inputSchema: object({
      query: {
        type: "string",
        description:
          "Search terms, preferably words likely to be used in the layer names and descriptions.",
      },
      limit: {
        type: ["integer", "null"],
        description: `How many matches to return, at most ${MAX_SEARCH_LIMIT}. Null means ${DEFAULT_SEARCH_LIMIT}.`,
      },
    }),
    async run({ query, limit }, { userCatalog, search }) {
      if (limit !== null && limit < 1) {
        throw new ToolError("limit must be at least 1.");
      }
      const { hits } = await search.search(
        userCatalog,
        query,
        Math.min(limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
      );
      return { result: { layers: hits.map((h) => listItem(h.record)) } };
    },
  }),

  define<{
    filters: LayerFilters;
    count_only: boolean;
    offset: number | null;
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
        type: nullableEnum(
          ["wms", "wmts", "wfs", "wfst", "vector", "arcgis", "builtin"],
          "The layer type."
        ),
        role: nullableEnum(
          ["layer", "background", "search"],
          "`layer` is in the layer tree, `background` is a background and `search` is only used in Search."
        ),
        group_id: {
          type: ["string", "null"],
          description: "A group id. Includes layers in its subgroups.",
        },
        missing: {
          type: ["array", "null"],
          items: {
            type: "string",
            enum: ["owner", "text", "contentTag", "infoUrl", "date"],
          },
          description: "Only layers that lack all of these fields.",
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

  define<{ group_id: string | null; offset: number | null }>({
    name: "browse_groups",
    kind: "read",
    description: `Walk the layer tree. Returns the subgroups of a group, then its own layers, ${PAGE_SIZE} items per page. A group's \`leafCount\` is how many layers it holds, including subgroups. Null lists the top level.`,
    inputSchema: object({
      group_id: {
        type: ["string", "null"],
        description: "The group to open. Null means the top level.",
      },
      offset: offsetSchema,
    }),
    run({ group_id: groupId, offset }, { userCatalog }) {
      const start = readOffset(offset);
      const group =
        groupId === null ? null : allowedGroup(userCatalog, groupId);
      const subGroups = userCatalog.groups
        .filter((g) => g.parentId === (group?.id ?? null))
        .sort((a, b) =>
          collator.compare(pathText(a.groupPath), pathText(b.groupPath))
        )
        .map((g) => ({
          id: g.id,
          name: g.name,
          groupPath: pathText(g.groupPath),
          exclusive: g.exclusive,
          leafCount: g.leafLayerIds.length,
        }));
      const layers =
        group === null
          ? []
          : directLayers(group, userCatalog).sort(byPlace).map(listItem);
      return { result: page([...subGroups, ...layers], start) };
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

  define<Record<string, never>>({
    name: "get_map_info",
    kind: "read",
    description:
      "Get the title and projection of the map, and which tools it offers.",
    inputSchema: object({}),
    run: (_input, { userCatalog }) => ({ result: userCatalog.mapInfo }),
  }),

  define<{ ids: string[] }>({
    name: "present_layers",
    kind: "action",
    description: `Show layers under your answer, with controls that let the user turn them on and off. Pick only what answers the question, at most ${MAX_PRESENTED}. Takes layer ids, group ids and sublayer addresses.`,
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
      'Turn layers on or off on the map. Takes layer ids, group ids, which cover everything below the group, and "layerId:subLayerId" sublayer addresses. Backgrounds aren\'t accepted, use set_background. Only one direct layer of an exclusive group can be on, and the result lists the layers that get hidden because of that. There is a limit on how many layers can be turned on at once, but none for turning them off. Always check `accepted` and `rejected` before telling the user what happened.',
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

  define<{ id: string }>({
    name: "set_background",
    kind: "action",
    description:
      "Change the background of the map. Exactly one background is always on, so there is no way to turn it off.",
    inputSchema: object({
      id: { type: "string", description: "The id of a background." },
    }),
    run({ id }, { userCatalog }) {
      const record = userCatalog.recordsById.get(id);
      if (record?.role !== "background") {
        const reason =
          record === undefined ? NOT_FOUND : "This layer isn't a background.";
        return { result: { accepted: [], rejected: [{ id, reason }] } };
      }
      return {
        result: { accepted: [id], rejected: [] },
        events: [{ type: "action", action: "set_background", id }],
      };
    },
  }),
];

const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

const failure = (message: string): ToolRun => ({
  content: JSON.stringify({ error: message }),
  isError: true,
  events: [],
});

/**
 * @summary Run a tool. Never rejects: a tool that fails gives a result that says
 * so, as the model needs an answer to every call and can often recover.
 */
export async function runTool(
  name: string,
  input: unknown,
  context: ToolContext
): Promise<ToolRun> {
  const tool = toolsByName.get(name);
  if (tool === undefined) {
    return failure(`Unknown tool "${name}".`);
  }

  const problem = validateInput(tool.inputSchema, input);
  if (problem !== null) {
    return failure(problem);
  }

  try {
    const { result, events = [] } = await tool.run(input, context);
    return { content: JSON.stringify(result), isError: false, events };
  } catch (error) {
    if (error instanceof ToolError) {
      return failure(error.message);
    }
    logger.error(`Tool "${name}" failed: ${(error as Error).message}`);
    return failure("The tool failed.");
  }
}

export const registry = { tools, run: runTool };
