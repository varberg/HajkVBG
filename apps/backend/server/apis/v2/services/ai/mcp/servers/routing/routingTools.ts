import log4js from "log4js";

import type { McpToolInfo } from "../../mcpClient.ts";
import { UnsupportedSchemaError } from "../../mcpSchema.ts";
import { bridgeTool, callMcp } from "../../mcpTools.ts";
import type { McpServer } from "../../mcpTools.ts";
import { NOT_FOUND, ToolError } from "../../../toolSupport.ts";
import type { ShownRoute, Tool, ToolContext } from "../../../tools.ts";
import { AVOID_SCHEMA } from "./avoid.ts";
import { LOCATION_SCHEMA, sridOf } from "./location.ts";
import { prepareArgs } from "./prepare.ts";

const logger = log4js.getLogger("service.ai.routing");

/** The tools the chat uses, in a fixed order. `data_status` isn't one. */
const KEPT = [
  "route",
  "multi_stop_route",
  "travel_time_matrix",
  "reachable_within",
  "find_street",
  "road_info",
  "line_info",
  "nearest_stops",
];

const URL_KEY = "geometry_url";
// The links expire after an hour, and the browser needs a moment to fetch one
const FRESH_MS = 50 * 60_000;
const FAR_SNAP_M = 100;
const MAIN_ROADS = 3;
const UNNAMED = "(unnamed road)";
const MAX_SHOWN = 30;

/** Sent once, in the system prompt, instead of in every tool description. */
export const ROUTING_INSTRUCTIONS = `Routing (the NVDB road network and Hallandstrafiken's public transport, for Varbergs kommun and about 15 km around it):
- Answer travel times, distances, routes, reachable areas and questions about bus lines with the routing tools, never from memory.
- Give a point as the \`id\` of a feature from search_features, in \`feature_id\`. For a street without a house number, use find_street and pass its x and y. Always give a short \`label\`.
- To route around road works, closures or other areas, pass them in \`avoid\`: all the features of a search by its \`resultId\` in \`result_id\`, or one feature in \`feature_id\`. For road works, first search for the ones going on today, by the date in the map state, that close the road, and use \`modes\` ["car"] when people on foot and bike may pass. Only avoid when the user asks for it.
- With \`avoid\`, say what was avoided, and how much longer the detour is from \`minutes_without_avoid\`. A warning that an area touches no road means it didn't change the route.
- Modes: car, the default, follows speed limits, one-way streets and turn restrictions, and is slower in towns and roundabouts. bike and walk avoid motorways, at a fixed speed. Traffic, time rules, access bans and weight or height limits aren't modelled, so say so when it matters.
- transit is public transport plus walking to, from and between stops. Its times are typical for one period of the day (see data_status), with an average wait instead of exact connections. So never give departure or arrival times, next departures or timetables, and don't plan an exact trip: say that the time is typical, and refer to Hallandstrafiken (hallandstrafiken.se or its app) for actual trips.
- For a transit route, say which lines to take, where to get on and off, and how long the walks are.
- For how far places are from public transport (hållplats, busshållplats), such as which schools are furthest from a stop, use nearest_stops with all the places in one call and compare \`walk_m\` of their nearest stop, instead of routing to stops yourself. First find every place with search_features, and page through all of them.
- line_info describes a line: its stops in order and how often it runs. When several lines match, call it again with the \`route_id\` of the right one.
- A large \`snap_m\` or any \`warnings\` mean that a point may be wrong. Tell the user.
- To compare many places, use travel_time_matrix, and only use route for the one you answer with.
- The tools give times in minutes with decimals. Write them as people say them: under a minute in seconds ("20 s"), then in whole minutes ("7 min", never "7,3 min" or "0,3 min"), and from an hour as "1 h 15 min". The same goes for tables.
- When the answer is about routes, reachable areas, lines or nearest stops, call show_route once, with the \`resultId\` of every one of them. That shows them on the map, with their streets, steps or stops under your answer, so don't list the streets or the stops of a line yourself.
- show_route marks the start and end of each route, and the user can turn each route on and off. So don't call show_features for the places of a route, unlike for other answers about features.`;

interface Street {
  name: string;
  km: number;
}

/** The longest named streets of a route, by their total length. */
function mainRoads(streets: unknown): string[] {
  if (!Array.isArray(streets)) {
    return [];
  }
  const km = new Map<string, number>();
  for (const { name, km: length } of streets as Street[]) {
    if (typeof name === "string" && name !== UNNAMED) {
      km.set(name, (km.get(name) ?? 0) + (Number(length) || 0));
    }
  }
  return [...km]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAIN_ROADS)
    .map(([name]) => name);
}

const omit = (object: Record<string, unknown>, ...keys: string[]) =>
  Object.fromEntries(
    Object.entries(object).filter(([key]) => !keys.includes(key))
  );

/** The streets along the walks of a transit route, which only the user gets. */
function withoutStreets(steps: unknown): unknown {
  return Array.isArray(steps)
    ? steps.map((step) =>
        step !== null && typeof step === "object"
          ? omit(step as Record<string, unknown>, "via")
          : step
      )
    : steps;
}

/**
 * @summary What the model sees of a result. Never the link, and for a route
 * not every street, as the user gets those from show_route. A transit route
 * keeps its steps, which say where to get on and off.
 */
export function modelView(
  tool: string,
  result: Record<string, unknown>
): Record<string, unknown> {
  if (tool !== "route") {
    return omit(result, URL_KEY);
  }
  const snap = result.snap_m;
  const far =
    Array.isArray(snap) &&
    snap.some((m) => typeof m === "number" && m > FAR_SNAP_M);
  const view = omit(result, URL_KEY, "streets", "streets_truncated", "snap_m");
  if (result.steps !== undefined) {
    view.steps = withoutStreets(result.steps);
  }
  const roads = mainRoads(result.streets);
  return {
    ...view,
    ...(roads.length > 0 ? { main_roads: roads } : {}),
    ...(far ? { snap_m: snap } : {}),
  };
}

const hasLink = (result: Record<string, unknown>) =>
  typeof result[URL_KEY] === "string";

/** @summary The link for the browser, in the map projection. */
function browserUrl(link: string, srid: number): string {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new ToolError("The route can't be shown.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ToolError("The route can't be shown.");
  }
  url.searchParams.set("srid", String(srid));
  return url.toString();
}

interface Rejection {
  id: string;
  reason: string;
}

/** What the browser draws for a tool, which is a route unless listed */
const KINDS: Record<string, ShownRoute["kind"]> = {
  reachable_within: "reach",
  line_info: "line",
  nearest_stops: "stops",
};

const kindOf = (tool: string): ShownRoute["kind"] => KINDS[tool] ?? "route";

/** A route for the browser: a link in the map projection and all its details. */
async function routeFor(
  id: string,
  srid: number,
  server: McpServer,
  context: ToolContext,
  now: () => number
): Promise<ShownRoute> {
  let stored = context.mcpResults.get(id);
  if (stored?.server !== server.name || !hasLink(stored.result)) {
    throw new ToolError(NOT_FOUND);
  }
  if (now() - stored.createdAt > FRESH_MS) {
    const result = await callMcp(
      server,
      stored.tool,
      stored.args,
      context.signal
    );
    if (!hasLink(result)) {
      throw new ToolError("The route can't be shown any more.");
    }
    stored = { ...stored, result, createdAt: now() };
    context.mcpResults.replace(id, stored);
  }
  const { [URL_KEY]: link, ...summary } = stored.result;
  return {
    url: browserUrl(link as string, srid),
    kind: kindOf(stored.tool),
    summary: { tool: stored.tool, ...summary },
  };
}

function showRoute(server: McpServer, now: () => number): Tool {
  return {
    name: "show_route",
    kind: "action",
    description: `Show routes, reachable areas, public transport lines or nearest stops from earlier routing results on the map, together, which also zooms to them. Replaces what was shown before, so give every route the answer is about in one call, at most ${MAX_SHOWN}.`,
    inputSchema: {
      type: "object",
      properties: {
        result_ids: {
          type: "array",
          items: { type: "string" },
          description: "The `resultId` of the routing results, in order.",
        },
      },
      required: ["result_ids"],
      additionalProperties: false,
    },
    async run(input, context: ToolContext) {
      const ids = [...new Set((input as { result_ids: string[] }).result_ids)];
      const srid = sridOf(context.userCatalog.mapInfo.projection);
      if (srid === null) {
        throw new ToolError("This map can't show routes.");
      }
      const rejected: Rejection[] = ids.slice(MAX_SHOWN).map((id) => ({
        id,
        reason: `At most ${MAX_SHOWN} can be shown.`,
      }));
      const outcomes = await Promise.all(
        ids.slice(0, MAX_SHOWN).map(async (id) => {
          try {
            return await routeFor(id, srid, server, context, now);
          } catch (error) {
            if (!(error instanceof ToolError)) {
              throw error;
            }
            rejected.push({ id, reason: error.message });
            return null;
          }
        })
      );
      const routes = outcomes.filter((route) => route !== null);
      return {
        result: { shown: routes.length, rejected },
        events:
          routes.length === 0
            ? []
            : [{ type: "action", action: "show_route", routes }],
      };
    },
  };
}

/**
 * @summary The chat's tools for the routing server, from its tool list.
 * A tool that is missing or can't be converted is left out with a warning.
 */
export function buildRoutingTools(
  server: McpServer,
  available: McpToolInfo[],
  now: () => number = Date.now
): Tool[] {
  const tools = KEPT.flatMap((name) => {
    const tool = available.find((t) => t.name === name);
    if (tool === undefined) {
      logger.warn(`The routing server has no tool "${name}".`);
      return [];
    }
    try {
      return [
        bridgeTool({
          server,
          tool,
          replacements: { Point: LOCATION_SCHEMA, AvoidArea: AVOID_SCHEMA },
          prepare: async (input, schema, context) =>
            (await prepareArgs(input, schema, context)) as Record<
              string,
              unknown
            >,
          view: (result) => modelView(name, result),
          keep: hasLink,
          now,
        }),
      ];
    } catch (error) {
      if (!(error instanceof UnsupportedSchemaError)) {
        throw error;
      }
      logger.warn(`Left out the routing tool "${name}": ${error.message}`);
      return [];
    }
  });
  return tools.length === 0 ? [] : [...tools, showRoute(server, now)];
}
