import {
  isSubLayerAddressAllowed,
  parseSubLayerAddress,
} from "../access.service.ts";
import type { UserCatalog } from "../access.service.ts";
import type {
  CatalogGroup,
  CatalogRecord,
  SubLayer,
} from "../catalog.service.ts";
import { NOT_FOUND, ToolError } from "../toolSupport.ts";
import type { Rejection } from "../toolSupport.ts";
import type { PresentedLayer } from "./events.ts";
import type { ToolContext } from "./types.ts";

export function allowedGroup(
  userCatalog: UserCatalog,
  id: string
): CatalogGroup {
  const group = userCatalog.groupsById.get(id);
  if (group === undefined) {
    throw new ToolError(`Unknown group id "${id}".`);
  }
  return group;
}

export const directLayers = (
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
  | { kind: "place"; record: CatalogRecord }
  | { kind: "subLayer"; parent: CatalogRecord; subLayer: SubLayer }
  | { kind: "folder"; group: CatalogGroup }
  | { kind: "none"; reason: string };

/**
 * @summary Find out what an id refers to, in the same order as the client's
 * LayerControlModel: a whole layer id, then a sublayer address, then a folder.
 */
export function lookup(id: string, userCatalog: UserCatalog): Lookup {
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

type ExclusiveSlot = NonNullable<ReturnType<typeof exclusiveSlot>>;

/**
 * @summary The exclusive groups below a plain folder, each with the direct child
 * that stays on when the folder is turned on. The client shows the leaves one
 * by one, in the order of `leafLayerIds`, so in an exclusive group each direct
 * child hides the one before it and the last one is left.
 */
function lastInExclusiveGroups(
  group: CatalogGroup,
  userCatalog: UserCatalog
): Map<string, string> {
  const last = new Map<string, string>();
  for (const id of group.leafLayerIds) {
    const parentId = userCatalog.recordsById.get(id)?.groupId;
    if (parentId && userCatalog.groupsById.get(parentId)?.exclusive) {
      last.set(parentId, id);
    }
  }
  return last;
}

/**
 * @summary The direct children of exclusive groups that a target leaves on,
 * one per group. Empty if the target doesn't touch an exclusive group.
 */
function exclusiveOutcomes(
  target: Target,
  userCatalog: UserCatalog
): ExclusiveSlot[] {
  if (target.kind === "folder" && !target.group.exclusive) {
    return [...lastInExclusiveGroups(target.group, userCatalog)].map(
      ([groupId, childId]) => ({
        group: userCatalog.groupsById.get(groupId) as CatalogGroup,
        childId,
      })
    );
  }
  const slot = exclusiveSlot(target, userCatalog);
  return slot === null ? [] : [slot];
}

/** @returns The leaves that a target leaves on, which count against the cap */
function leavesOf(id: string, target: Target, userCatalog: UserCatalog) {
  if (target.kind !== "folder") {
    return [id];
  }
  const { group } = target;
  if (group.exclusive) {
    return directLayers(group, userCatalog)
      .slice(0, 1)
      .map((record) => record.id);
  }
  const last = lastInExclusiveGroups(group, userCatalog);
  return group.leafLayerIds.filter((leaf) => {
    const parentId = userCatalog.recordsById.get(leaf)?.groupId;
    return !parentId || !last.has(parentId) || last.get(parentId) === leaf;
  });
}

export function resolveTargets(ids: string[], userCatalog: UserCatalog) {
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
    } else if (found.kind === "place") {
      rejected.push({ id, reason: "This is a place, use go_to_place." });
    } else if (found.kind === "none") {
      rejected.push({ id, reason: found.reason });
    } else {
      targets.set(id, found);
    }
  }
  return { targets, rejected };
}

export function turnOn(
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
    accepted.flatMap((id) =>
      exclusiveOutcomes(targets.get(id) as Target, userCatalog).map(
        (slot) => [slot.group.id, slot] as const
      )
    )
  );
  const hiddenSiblings = [...slots.values()].flatMap(({ group, childId }) =>
    directLayers(group, userCatalog)
      .filter((r) => r.id !== childId && visibleLayers.has(r.id))
      .map((r) => ({ id: r.id, caption: r.caption, group: group.name }))
  );

  // Also the exclusive groups inside a plain folder, which leave only one on
  const shownInExclusiveFolders = accepted.flatMap((id) => {
    const target = targets.get(id) as Target;
    return target.kind === "folder"
      ? exclusiveOutcomes(target, userCatalog).map(({ group, childId }) => ({
          folderId: group.id,
          shownLayerId: childId,
        }))
      : [];
  });

  for (const id of accepted) {
    const target = targets.get(id) as Target;
    for (const leaf of leavesOf(id, target, userCatalog)) {
      visibleLayers.add(target.kind === "subLayer" ? target.parent.id : leaf);
    }
  }
  // Whatever else this call turned on, one child per exclusive group is left
  for (const { group, childId } of slots.values()) {
    directLayers(group, userCatalog)
      .filter((r) => r.id !== childId)
      .forEach((r) => visibleLayers.delete(r.id));
  }

  return { accepted, hiddenSiblings, shownInExclusiveFolders };
}

export function turnOff(
  targets: Map<string, Target>,
  { visibleLayers }: ToolContext
) {
  for (const [id, target] of targets) {
    if (target.kind === "folder") {
      target.group.leafLayerIds.forEach((leaf) => visibleLayers.delete(leaf));
    } else if (target.kind === "layer") {
      visibleLayers.delete(id);
    }
    // Other sublayers can stay on, so a sublayer says nothing about its parent
  }
  return { accepted: [...targets.keys()] };
}

export function presentedItem(
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
    case "place":
      // The group path is only there for search, and would repeat on every row
      return {
        id,
        caption: found.record.caption,
        groupPath: [],
        control: "place",
        place: found.record.presetName ?? found.record.caption,
      };
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
