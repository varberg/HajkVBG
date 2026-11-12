import type { UserCatalog } from "../access.service.ts";
import { NOT_FOUND } from "../toolSupport.ts";
import type { PluginAction } from "./events.ts";
import { define, object } from "./schema.ts";
import type { Tool, ToolOutput } from "./types.ts";

const NO_SUCH_PLUGIN = "There is no such tool.";

/**
 * @summary Open or close a plugin. It's the same answer for a plugin that can't
 * be opened as for one the user can't reach, which must not be confirmed.
 */
function runPluginAction(
  action: PluginAction,
  plugin: string,
  { mapInfo }: UserCatalog
): ToolOutput {
  const type = plugin.toLowerCase();
  if (!mapInfo.tools.some((tool) => tool.type === type && tool.openable)) {
    return {
      result: {
        accepted: [],
        rejected: [{ id: plugin, reason: NO_SUCH_PLUGIN }],
      },
    };
  }
  return {
    result: { accepted: [type], rejected: [] },
    events: [{ type: "action", action, plugin: type }],
  };
}

/** The background, the plugins and the named places of the map. */
export const mapTools: Tool[] = [
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

  define<{ plugin: string }>({
    name: "open_plugin",
    kind: "action",
    description:
      "Open one of the map's tools for the user, such as the drawing or printing tool. Takes a type from the list of tools that can be opened. Always check `accepted` and `rejected` before telling the user what happened.",
    inputSchema: object({
      plugin: { type: "string", description: "The type of the tool to open." },
    }),
    run: ({ plugin }, { userCatalog }) =>
      runPluginAction("open_plugin", plugin, userCatalog),
  }),

  define<{ plugin: string }>({
    name: "close_plugin",
    kind: "action",
    description:
      "Close one of the map's tools for the user. Takes a type from the list of tools that can be opened. Closing a tool that isn't open changes nothing. Always check `accepted` and `rejected` before telling the user what happened.",
    inputSchema: object({
      plugin: { type: "string", description: "The type of the tool to close." },
    }),
    run: ({ plugin }, { userCatalog }) =>
      runPluginAction("close_plugin", plugin, userCatalog),
  }),

  define<{ id: string }>({
    name: "go_to_place",
    kind: "action",
    description:
      "Move the map to a named place. Takes the id of a place, which is a result with the role `place`. If `needsConfirmation` is true, the user first has to confirm in a dialog that replaces the layers on the map, and the map hasn't moved yet. Always check `accepted` and `rejected` before telling the user what happened.",
    inputSchema: object({
      id: { type: "string", description: "The id of a place." },
    }),
    run({ id }, { userCatalog }) {
      const record = userCatalog.recordsById.get(id);
      if (record?.role !== "place") {
        return {
          result: {
            accepted: [],
            rejected: [{ id, reason: NOT_FOUND }],
            needsConfirmation: false,
          },
        };
      }
      return {
        result: {
          accepted: [id],
          rejected: [],
          needsConfirmation: record.changesLayers === true,
        },
        events: [
          {
            type: "action",
            action: "go_to_place",
            place: record.presetName ?? record.caption,
          },
        ],
      };
    },
  }),
];
