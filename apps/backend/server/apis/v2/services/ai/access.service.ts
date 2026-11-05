import configService from "../config.service.js";
import { AccessError } from "../../utils/AccessError.js";
import { validateMapName } from "../../utils/safePath.js";
import defaultCatalogService, {
  groupsWithLeaves,
  walkMapConfig,
} from "./catalog.service.ts";
import type {
  Catalog,
  CatalogGroup,
  CatalogRecord,
  CatalogService,
  ConfigSource,
  LayerRole,
  MapInfo,
  WalkedMap,
} from "./catalog.service.ts";

// Group membership changes reach the chat within this time.
const CACHE_TTL_MS = 60_000;
// Logged in users get one entry each, so the cache needs an upper limit.
const CACHE_MAX_ENTRIES = 200;

/**
 * What a user may reach, per role. A single flat set isn't enough: a layer
 * removed from a user's tree but left in Search must not get a toggle.
 */
export interface AllowedSets {
  layers: ReadonlySet<string>;
  backgrounds: ReadonlySet<string>;
  search: ReadonlySet<string>;
  groups: ReadonlySet<string>;
}

export interface GroupTreeNode {
  id: string;
  name: string;
  exclusive: boolean;
  leafCount: number;
  children: GroupTreeNode[];
}

/**
 * The catalog as one user may see it. Everything downstream works on this, so
 * the access rules are applied before any search or listing has started.
 */
export interface UserCatalog {
  map: string;
  /** From the washed config, so it leaves out tools the user can't reach. */
  mapInfo: MapInfo;
  allowed: AllowedSets;
  records: CatalogRecord[];
  recordsById: Map<string, CatalogRecord>;
  groups: CatalogGroup[];
  groupsById: Map<string, CatalogGroup>;
  groupTree: GroupTreeNode[];
}

/**
 * @summary A record as seen by a user who has it in `role`. The tree position,
 * and with it the inherited group info, is only kept for the layer's own role:
 * a user who only reaches a layer through Search must not learn about its group.
 */
function viewRecord(
  record: CatalogRecord,
  role: LayerRole,
  searchable: boolean,
  catalog: Catalog
): CatalogRecord {
  if (role === record.role) {
    return searchable === record.searchable
      ? record
      : { ...record, searchable };
  }
  return {
    ...record,
    role,
    searchable,
    isGroupLayer: false,
    subLayersToggleable: false,
    groupPath: [],
    groupId: null,
    text: catalog.ownTextById.get(record.id) ?? null,
  };
}

function buildGroupTree(groups: CatalogGroup[]): GroupTreeNode[] {
  const roots: GroupTreeNode[] = [];
  const nodes = new Map<string, GroupTreeNode>();

  // Groups come in walking order, so a parent is always there before its children.
  for (const group of groups) {
    const node: GroupTreeNode = {
      id: group.id,
      name: group.name,
      exclusive: group.exclusive,
      leafCount: group.leafLayerIds.length,
      children: [],
    };
    nodes.set(group.id, node);
    const parent = group.parentId === null ? null : nodes.get(group.parentId);
    (parent?.children ?? roots).push(node);
  }

  return roots;
}

/**
 * @summary The group tree as compact text for the prompt, one group per line:
 * `- Name [id] (allowed leaf layers)`, with nesting shown by indentation.
 */
export function renderGroupTree(nodes: GroupTreeNode[], depth = 0): string {
  return nodes
    .flatMap((node) => {
      const exclusive = node.exclusive ? " exclusive" : "";
      const line = `${"  ".repeat(depth)}- ${node.name} [${node.id}] (${node.leafCount})${exclusive}`;
      return node.children.length > 0
        ? [line, renderGroupTree(node.children, depth + 1)]
        : [line];
    })
    .join("\n");
}

/**
 * @summary Limit a raw catalog to what a walked, washed map config allows.
 */
export function buildUserCatalog(
  catalog: Catalog,
  walked: WalkedMap
): UserCatalog {
  const known = (id: string) => catalog.recordsById.has(id);

  const layers = new Set(walked.tree.map((l) => l.id).filter(known));
  const backgrounds = new Set(
    [
      ...walked.backgrounds,
      ...walked.builtInBackgrounds.map((b) => b.id),
    ].filter(known)
  );
  const search = new Set(walked.search.filter(known));

  // A group survives only if the user may reach at least one layer below it.
  const groups = groupsWithLeaves(walked.groups, layers).filter(
    (group) => group.leafLayerIds.length > 0
  );

  const records: CatalogRecord[] = [];
  for (const record of catalog.records) {
    const { id } = record;
    const role: LayerRole | null = layers.has(id)
      ? "layer"
      : backgrounds.has(id)
        ? "background"
        : search.has(id)
          ? "search"
          : null;
    if (role !== null) {
      records.push(viewRecord(record, role, search.has(id), catalog));
    }
  }

  return {
    map: catalog.map,
    mapInfo: walked.info,
    allowed: {
      layers,
      backgrounds,
      search,
      groups: new Set(groups.map((g) => g.id)),
    },
    records,
    recordsById: new Map(records.map((r) => [r.id, r])),
    groups,
    groupsById: new Map(groups.map((g) => [g.id, g])),
    groupTree: buildGroupTree(groups),
  };
}

/**
 * @summary Split a `"layerId:subLayerId"` address, the same way as the client's
 * LayerControlModel: at the first colon, and only if the whole id isn't a layer.
 */
export function parseSubLayerAddress(
  userCatalog: UserCatalog,
  address: string
): { layerId: string; subLayerId: string } | null {
  const index = address.indexOf(":");
  if (index <= 0 || userCatalog.recordsById.has(address)) {
    return null;
  }
  const subLayerId = address.slice(index + 1);
  return subLayerId === ""
    ? null
    : { layerId: address.slice(0, index), subLayerId };
}

/**
 * @summary A sublayer address is allowed only if the user has the parent layer
 * in the tree, and the LayerSwitcher shows that layer's sublayers.
 */
export function isSubLayerAddressAllowed(
  userCatalog: UserCatalog,
  address: string
): boolean {
  const parsed = parseSubLayerAddress(userCatalog, address);
  if (parsed === null || !userCatalog.allowed.layers.has(parsed.layerId)) {
    return false;
  }
  const parent = userCatalog.recordsById.get(parsed.layerId);
  return (
    parent?.subLayersToggleable === true &&
    parent.subLayers.some((sub) => sub.id === parsed.subLayerId)
  );
}

interface AccessServiceOptions {
  config?: ConfigSource;
  catalogs?: Pick<CatalogService, "getCatalog">;
  now?: () => number;
}

interface CacheEntry {
  catalog: Catalog;
  expires: number;
  userCatalog: UserCatalog;
}

export class AccessService {
  #config: ConfigSource;
  #catalogs: Pick<CatalogService, "getCatalog">;
  #now: () => number;
  #cache = new Map<string, CacheEntry>();

  constructor({ config, catalogs, now }: AccessServiceOptions = {}) {
    this.#config = config ?? (configService as unknown as ConfigSource);
    this.#catalogs = catalogs ?? defaultCatalogService;
    this.#now = now ?? Date.now;
  }

  /**
   * @summary Get the catalog as a given user may see it.
   * @description Without a login the user is undefined, so all visitors share
   * one entry per map. That is correct, as they all see the same layers.
   *
   * @throws {AccessError} If the user lacks access to the map or the aichat tool
   * @throws The error from the config service, if it couldn't tell what the
   * user may see. Failing here is what denies access.
   */
  async getUserCatalog(map: string, user?: string): Promise<UserCatalog> {
    const safeMap: string = validateMapName(map);
    const catalog = await this.#catalogs.getCatalog(safeMap);

    // JSON keeps a user who is really named "anonymous" apart from no user.
    const key = JSON.stringify([safeMap, user ?? null]);
    const hit = this.#cache.get(key);
    // A changed file gives a new catalog, which is what clears old entries.
    if (hit?.catalog === catalog && hit.expires > this.#now()) {
      return hit.userCatalog;
    }
    this.#cache.delete(key);

    const washed = await this.#config.getMapConfig(safeMap, user);
    if (washed.error) {
      throw washed.error;
    }

    const tools = Array.isArray(washed.tools) ? washed.tools : [];
    if (!tools.some((tool) => tool?.type === "aichat")) {
      throw new AccessError(`AI chat is not available in map "${safeMap}".`);
    }

    const userCatalog = buildUserCatalog(catalog, walkMapConfig(washed));

    if (this.#cache.size >= CACHE_MAX_ENTRIES) {
      this.#cache.delete(this.#cache.keys().next().value as string);
    }
    this.#cache.set(key, {
      catalog,
      expires: this.#now() + CACHE_TTL_MS,
      userCatalog,
    });

    return userCatalog;
  }
}

export default new AccessService();
