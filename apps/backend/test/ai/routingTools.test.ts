import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildUserCatalog } from "../../server/apis/v2/services/ai/access.service.ts";
import {
  buildCatalog,
  walkMapConfig,
} from "../../server/apis/v2/services/ai/catalog.service.ts";
import { FeatureResultStore } from "../../server/apis/v2/services/ai/features/featureResults.ts";
import type { Geometry } from "../../server/apis/v2/services/ai/features/geojson.ts";
import type { WfsAccess } from "../../server/apis/v2/services/ai/features/wfsAccess.ts";
import type {
  McpCallResult,
  McpConnection,
  McpToolInfo,
} from "../../server/apis/v2/services/ai/mcp/mcpClient.ts";
import { McpResultStore } from "../../server/apis/v2/services/ai/mcp/mcpResults.ts";
import { representativePoint } from "../../server/apis/v2/services/ai/features/points.ts";
import { sridOf } from "../../server/apis/v2/services/ai/mcp/servers/routing/location.ts";
import { buildRoutingTools } from "../../server/apis/v2/services/ai/mcp/servers/routing/routingTools.ts";
import { createRegistry } from "../../server/apis/v2/services/ai/tools.ts";
import type {
  ToolContext,
  ToolEvent,
} from "../../server/apis/v2/services/ai/tools.ts";
import { featureMapConfig, featureStore } from "./fixtures.ts";

const toolList = (): McpToolInfo[] =>
  JSON.parse(
    fs.readFileSync(new URL("./routing-tools.json", import.meta.url), "utf-8")
  ).tools;

const URL_BASE = "http://routing.example.com/geojson/signed";

const ROUTE_RESULT = {
  mode: "bike",
  from: "Station",
  to: "Skola",
  status: "ok",
  minutes: 12.5,
  km: 3.4,
  snap_m: [12, 40],
  streets: [
    { name: "Västra vägen", km: 1.2, minutes: 4 },
    { name: "(unnamed road)", km: 2, minutes: 5 },
    { name: "Östra vägen", km: 0.4, minutes: 2 },
    { name: "Västra vägen", km: 0.5, minutes: 1 },
    { name: "Torget", km: 0.1, minutes: 0.5 },
    { name: "Gränden", km: 0.05, minutes: 0.2 },
  ],
  geometry_url: `${URL_BASE}/1`,
};

const TRANSIT_RESULT = {
  mode: "transit",
  from: "Station",
  to: "Skola",
  status: "ok",
  minutes: 60.2,
  km: 11.61,
  snap_m: [42, 218],
  walk_min: 35,
  wait_min: 15,
  ride_min: 10.2,
  changes: 0,
  lines: [{ line: "664", trips_per_hour: 0.33 }],
  steps: [
    { walk_min: 4.3, km: 0.36, via: ["Drottninggatan"] },
    { wait_min: 15, line: "664", at: "Komedianten" },
    {
      ride_min: 10.2,
      line: "664",
      towards: "Kusagärde",
      from: "Komedianten",
      to: "Lindbergs skola",
      trips_per_hour: 0.33,
    },
    { walk_min: 30.7, km: 2.56 },
  ],
  note: "Typical time for the analysis period with average waits.",
  geometry_url: `${URL_BASE}/transit`,
};

const LINE_RESULT = {
  route_id: "9011013160200000",
  line: "2",
  mode: "bus",
  variants: [
    {
      direction_id: 0,
      from: "Erlandsgården",
      to: "Trönninge",
      trips_per_hour: 4.33,
      run_minutes: 28,
      stops: [
        { stop: "Erlandsgården", minutes: 0 },
        { stop: "Trönninge", minutes: 28 },
      ],
    },
  ],
  geometry_url: `${URL_BASE}/line`,
};

const STOPS_RESULT = {
  analysis_period: "06:00-09:00",
  results: [
    {
      point: "Skola",
      snap_m: 218,
      stops: [
        {
          stop: "Lindbergs skola",
          walk_min: 32.4,
          walk_m: 2696,
          lon: 12.31,
          lat: 57.16,
          lines: ["662", "664"],
          departures_per_hour: 2,
        },
      ],
    },
  ],
  geometry_url: `${URL_BASE}/stops`,
};

interface Call {
  name: string;
  args: Record<string, unknown>;
}

/** A server that answers from a function, and remembers what it was asked. */
function fakeServer(
  answer: (call: Call) => Partial<McpCallResult> & {
    structured?: Record<string, unknown> | null;
  } = () => ({ structured: { ...ROUTE_RESULT } })
) {
  const calls: Call[] = [];
  const connection: McpConnection = {
    listTools: async () => toolList(),
    async call(name, args) {
      calls.push({ name, args });
      return {
        structured: null,
        text: "",
        isError: false,
        ...answer({ name, args }),
      };
    },
  };
  return {
    calls,
    server: { name: "routing", exposure: "model" as const, connection },
  };
}

const point = (x: number, y: number): Geometry => ({
  type: "Point",
  coordinates: [x, y],
});

/** Answers every request with one feature at 140000, 6330000 (EPSG:3007). */
const wfs: WfsAccess = {
  connectionOf: async (_map, id) =>
    buildCatalog(
      "demo",
      featureMapConfig(),
      featureStore()
    ).featureConnections.get(id),
  query: async () => ({
    features: [
      {
        type: "Feature",
        id: "adress.1",
        geometry: point(140000, 6330000),
        properties: { sok: "Skolgatan 1" },
      },
    ],
    total: 1,
  }),
};

function context(): ToolContext {
  const featureResults = new FeatureResultStore();
  // As search_features keeps it: a feature with its point
  featureResults.addFeature("adress.1", "adress", [140000, 6330000]);
  // One that a search found without a point, which takes a request
  featureResults.addFeature("adress.2", "adress");
  return {
    userCatalog: buildUserCatalog(
      buildCatalog("demo", featureMapConfig(), featureStore()),
      walkMapConfig(featureMapConfig())
    ),
    maxLayersOn: 25,
    visibleLayers: new Set(),
    search: { search: async () => ({ hits: [], mode: "keyword" }) },
    wfs,
    featureResults,
    signal: new AbortController().signal,
    wfsRequests: 0,
    wfsResponses: new Map(),
    drawn: new Map(),
    mcpResults: new McpResultStore(),
  };
}

async function setup(
  answer?: Parameters<typeof fakeServer>[0],
  now: () => number = () => 0
) {
  const { server, calls } = fakeServer(answer);
  const tools = buildRoutingTools(server, toolList(), now);
  const registry = createRegistry([
    { name: "routing", load: async () => ({ tools, prompt: "Routing." }) },
  ]);
  await registry.refresh();
  const ctx = context();
  const run = async (name: string, input: unknown) => {
    const result = await registry.run(name, input, ctx);
    return { ...result, result: JSON.parse(result.content) };
  };
  return { registry, calls, ctx, run, tools };
}

const place = (overrides: object = {}) => ({
  feature_id: null,
  x: 12.25,
  y: 57.1,
  label: "Station",
  ...overrides,
});

const routeInput = (overrides: object = {}) => ({
  origin: place(),
  destination: place({
    feature_id: "adress.1",
    x: null,
    y: null,
    label: "Skola",
  }),
  mode: "bike",
  avoid: null,
  ...overrides,
});

const shownRoutes = (events: ToolEvent[]) => {
  assert.equal(events.length, 1);
  const event = events[0];
  assert.ok(event.type === "action" && event.action === "show_route");
  return event.routes;
};

const shownRoute = (events: ToolEvent[]) => {
  const routes = shownRoutes(events);
  assert.equal(routes.length, 1);
  return routes[0];
};

const show = (...ids: string[]) => ({ result_ids: ids });

describe("buildRoutingTools", () => {
  test("keeps the routing tools, adds show_route and drops data_status", async () => {
    const { tools } = await setup();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        "route",
        "multi_stop_route",
        "travel_time_matrix",
        "reachable_within",
        "find_street",
        "road_info",
        "line_info",
        "nearest_stops",
        "show_route",
      ]
    );
    const origin = tools[0].inputSchema.properties!.origin;
    assert.deepEqual(origin.required, ["feature_id", "x", "y", "label"]);
  });

  test("the registry adds the tools and the prompt after refresh", async () => {
    const { registry } = await setup();
    assert.ok(registry.tools.some((tool) => tool.name === "route"));
    assert.deepEqual(registry.promptSections, ["Routing."]);
  });
});

describe("createRegistry", () => {
  test("runs without an extension that fails, and tries it again after a minute", async () => {
    let now = 0;
    let attempts = 0;
    const builtIn = createRegistry().tools.map((tool) => tool.name);
    const registry = createRegistry(
      [
        {
          name: "routing",
          async load() {
            attempts += 1;
            throw new Error("connect ECONNREFUSED");
          },
        },
      ],
      () => now
    );
    await registry.refresh();
    await registry.refresh();
    assert.equal(attempts, 1);
    assert.deepEqual(
      registry.tools.map((tool) => tool.name),
      builtIn
    );
    assert.deepEqual(registry.promptSections, []);
    now = 60_000;
    await registry.refresh();
    assert.equal(attempts, 2);
  });

  test("refuses an extension whose tool names are taken", async () => {
    const { tools } = await setup();
    const registry = createRegistry([
      {
        name: "routing",
        load: async () => ({
          tools: [{ ...tools[0], name: "search_layers" }],
          prompt: "",
        }),
      },
    ]);
    await registry.refresh();
    assert.ok(!registry.promptSections.includes(""));
    assert.equal(
      registry.tools.filter((tool) => tool.name === "search_layers").length,
      1
    );
  });
});

describe("routing tools", () => {
  test("send a feature in the map projection and lon/lat as 4326", async () => {
    const { run, calls } = await setup();
    const { isError } = await run("route", routeInput());
    assert.equal(isError, false);
    assert.deepEqual(calls[0], {
      name: "route",
      args: {
        origin: { x: 12.25, y: 57.1, srid: 4326, label: "Station" },
        destination: { x: 140000, y: 6330000, srid: 3007, label: "Skola" },
        mode: "bike",
      },
    });
  });

  test("leave out a mode the model left as null, so the server's default applies", async () => {
    const { run, calls } = await setup();
    await run("route", routeInput({ mode: null }));
    assert.ok(!("mode" in calls[0].args));
  });

  test("give the model no link and no street list, but the main roads", async () => {
    const { run, ctx } = await setup();
    const { result, content } = await run("route", routeInput());
    assert.ok(!content.includes("geojson"));
    assert.deepEqual(result.main_roads, [
      "Västra vägen",
      "Östra vägen",
      "Torget",
    ]);
    assert.ok(!("streets" in result));
    assert.ok(!("snap_m" in result));
    assert.equal(result.resultId, "m1");
    // The whole result is kept for show_route
    assert.equal(ctx.mcpResults.get("m1")!.result.streets !== undefined, true);
  });

  test("give the model the steps of a transit route, without the streets", async () => {
    const { run } = await setup(() => ({ structured: { ...TRANSIT_RESULT } }));
    const { result } = await run("route", routeInput({ mode: "transit" }));
    assert.deepEqual(result.lines, TRANSIT_RESULT.lines);
    assert.deepEqual(result.steps, [
      { walk_min: 4.3, km: 0.36 },
      { wait_min: 15, line: "664", at: "Komedianten" },
      TRANSIT_RESULT.steps[2],
      { walk_min: 30.7, km: 2.56 },
    ]);
    assert.ok(!("main_roads" in result));
    assert.equal(result.resultId, "m1");
  });

  test("keep snap_m when a point is far from the road", async () => {
    const { run } = await setup(() => ({
      structured: { ...ROUTE_RESULT, snap_m: [12, 450] },
    }));
    const { result } = await run("route", routeInput());
    assert.deepEqual(result.snap_m, [12, 450]);
  });

  test("give results without a link as they are, without a resultId", async () => {
    const matrix = {
      mode: "car",
      points: ["A", "B"],
      minutes: [
        [0, 4],
        [5, 0],
      ],
    };
    const { run } = await setup(() => ({ structured: matrix }));
    const { result } = await run("travel_time_matrix", {
      points: [place(), place({ label: "B" })],
      mode: "car",
      avoid: null,
    });
    assert.deepEqual(result, matrix);
  });

  test("pass on the server's error text", async () => {
    const { run } = await setup(() => ({
      isError: true,
      text: "point 1 is 26.1 km from the nearest road",
    }));
    const { isError, result } = await run("route", routeInput());
    assert.equal(isError, true);
    assert.match(result.error, /26\.1 km/);
  });

  test("try once more when a call times out", async () => {
    let failures = 1;
    const { run, calls } = await setup(() => {
      if (failures-- > 0) {
        throw new Error("MCP error -32001: Request timed out");
      }
      return { structured: { ...ROUTE_RESULT } };
    });
    const { isError, result } = await run("route", routeInput());
    assert.equal(isError, false);
    assert.equal(result.minutes, 12.5);
    assert.equal(calls.length, 2);
  });

  test("give up after the second failed call", async () => {
    const { run, calls } = await setup(() => {
      throw new Error("MCP error -32001: Request timed out");
    });
    const { isError, result } = await run("route", routeInput());
    assert.equal(isError, true);
    assert.match(result.error, /couldn't be reached/);
    assert.equal(calls.length, 2);
  });

  test("refuse a point that is neither a feature nor coordinates", async () => {
    const { run, calls } = await setup();
    const { isError } = await run(
      "route",
      routeInput({ origin: place({ x: null }) })
    );
    assert.equal(isError, true);
    assert.equal(calls.length, 0);
  });

  test("refuse an unknown feature without calling the server", async () => {
    const { run, calls } = await setup();
    const { isError } = await run(
      "route",
      routeInput({ origin: place({ feature_id: "adress.okand" }) })
    );
    assert.equal(isError, true);
    assert.equal(calls.length, 0);
  });
});

describe("locations from features", () => {
  test("use the point the search kept, without a request", async () => {
    const { run, calls, ctx } = await setup();
    await run("route", routeInput());
    assert.equal(ctx.wfsRequests, 0);
    assert.deepEqual(calls[0].args.destination, {
      x: 140000,
      y: 6330000,
      srid: 3007,
      label: "Skola",
    });
  });

  test("fetch the feature when the search kept no point", async () => {
    const { run, calls, ctx } = await setup();
    await run(
      "route",
      routeInput({
        destination: place({ feature_id: "adress.2", x: null, y: null }),
      })
    );
    assert.equal(ctx.wfsRequests, 1);
    assert.equal((calls[0].args.destination as { srid: number }).srid, 3007);
  });

  test("reach 30 features in one question", async () => {
    const { run, calls } = await setup();
    for (let i = 0; i < 30; i++) {
      assert.equal((await run("route", routeInput())).isError, false);
    }
    assert.equal(calls.length, 30);
  });
});

describe("show_route", () => {
  test("sends the link in the map projection and the whole summary to the browser", async () => {
    const { run } = await setup();
    await run("route", routeInput());
    const { result, events, content } = await run("show_route", show("m1"));
    assert.deepEqual(result, { shown: 1, rejected: [] });
    assert.ok(!content.includes("http"));
    const event = shownRoute(events);
    assert.equal(event.url, `${URL_BASE}/1?srid=3007`);
    assert.equal(event.kind, "route");
    assert.equal(event.summary.tool, "route");
    assert.equal((event.summary.streets as unknown[]).length, 6);
    assert.ok(!("geometry_url" in event.summary));
  });

  test("gets a fresh link when the stored one is about to expire", async () => {
    let now = 0;
    let link = 0;
    const { run, calls } = await setup(
      () => ({
        structured: { ...ROUTE_RESULT, geometry_url: `${URL_BASE}/${++link}` },
      }),
      () => now
    );
    await run("route", routeInput());
    now = 55 * 60_000;
    const { events } = await run("show_route", show("m1"));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].args, calls[0].args);
    assert.equal(shownRoute(events).url, `${URL_BASE}/2?srid=3007`);
  });

  test("calls a reachable area `reach`", async () => {
    const { run } = await setup(() => ({
      structured: {
        mode: "car",
        minutes: 10,
        road_km: 40,
        geometry_url: `${URL_BASE}/r`,
      },
    }));
    await run("reachable_within", {
      origin: place(),
      minutes: 10,
      mode: "car",
      avoid: null,
    });
    const { events } = await run("show_route", show("m1"));
    assert.equal(shownRoute(events).kind, "reach");
  });

  test("calls a public transport line `line`, with its stops", async () => {
    const { run } = await setup(() => ({ structured: { ...LINE_RESULT } }));
    const { result } = await run("line_info", { line: "2" });
    assert.equal(result.resultId, "m1");
    assert.equal(result.variants[0].stops.length, 2);
    const { events } = await run("show_route", show("m1"));
    const route = shownRoute(events);
    assert.equal(route.kind, "line");
    assert.equal(route.summary.tool, "line_info");
    assert.equal(route.url, `${URL_BASE}/line?srid=3007`);
  });

  test("shows nearest stops as `stops`, from all the places in one call", async () => {
    const { run, calls } = await setup(() => ({
      structured: { ...STOPS_RESULT },
    }));
    const { result } = await run("nearest_stops", {
      points: [
        place({ feature_id: "adress.1", x: null, y: null, label: "Skola" }),
        place(),
      ],
      limit: 1,
    });
    assert.equal(calls[0].args.limit, 1);
    assert.equal((calls[0].args.points as unknown[]).length, 2);
    assert.equal(result.results[0].stops[0].walk_m, 2696);
    const { events } = await run("show_route", show(result.resultId));
    const route = shownRoute(events);
    assert.equal(route.kind, "stops");
    assert.equal(route.summary.tool, "nearest_stops");
  });

  test("shows several routes together, in the order asked for", async () => {
    let link = 0;
    const { run } = await setup(() => ({
      structured: { ...ROUTE_RESULT, geometry_url: `${URL_BASE}/${++link}` },
    }));
    for (let i = 0; i < 3; i++) {
      await run("route", routeInput());
    }
    const { result, events } = await run("show_route", show("m3", "m1", "m3"));
    assert.deepEqual(result, { shown: 2, rejected: [] });
    assert.deepEqual(
      shownRoutes(events).map((route) => route.url),
      [`${URL_BASE}/3?srid=3007`, `${URL_BASE}/1?srid=3007`]
    );
  });

  test("shows the routes it can and rejects the rest", async () => {
    const { run } = await setup();
    await run("route", routeInput());
    const { result, events } = await run("show_route", show("m1", "m9"));
    assert.deepEqual(result, {
      shown: 1,
      rejected: [{ id: "m9", reason: "Unknown id." }],
    });
    assert.equal(shownRoutes(events).length, 1);
  });

  test("shows at most 30 routes", async () => {
    const { run } = await setup();
    for (let i = 0; i < 31; i++) {
      await run("route", routeInput());
    }
    const ids = Array.from({ length: 31 }, (_, i) => `m${i + 1}`);
    const { result, events } = await run("show_route", show(...ids));
    assert.equal(result.shown, 30);
    assert.equal(result.rejected[0].id, "m31");
    assert.equal(shownRoutes(events).length, 30);
  });

  test("rejects an unknown id and a link that isn't http, and sends nothing", async () => {
    const { run } = await setup(() => ({
      structured: { ...ROUTE_RESULT, geometry_url: "javascript:alert(1)" },
    }));
    await run("route", routeInput());
    const shown = await run("show_route", show("m9", "m1"));
    assert.equal(shown.result.shown, 0);
    assert.deepEqual(
      shown.result.rejected.map((r: { id: string }) => r.id),
      ["m9", "m1"]
    );
    assert.equal(shown.events.length, 0);
  });
});

describe("location helpers", () => {
  test("sridOf reads EPSG codes only", () => {
    assert.equal(sridOf("EPSG:3007"), 3007);
    assert.equal(sridOf("epsg:4326"), 4326);
    assert.equal(sridOf(null), null);
    assert.equal(sridOf("CRS:84"), null);
  });

  test("representativePoint is on the geometry", () => {
    assert.deepEqual(representativePoint(point(1, 2)), [1, 2]);
    assert.deepEqual(
      representativePoint({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      }),
      [1, 1]
    );
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const corner = representativePoint({
      type: "Polygon",
      coordinates: [square],
    });
    assert.ok(square.some(([x, y]) => x === corner[0] && y === corner[1]));
  });
});

describe("avoid", () => {
  const area = (overrides: object = {}) => ({
    feature_id: null,
    result_id: null,
    buffer_m: null,
    modes: null,
    label: "Vägarbete",
    ...overrides,
  });

  const AREA: Geometry = {
    type: "Polygon",
    coordinates: [
      [
        [140000, 6330000],
        [140100, 6330000],
        [140100, 6330100],
        [140000, 6330000],
      ],
    ],
  };

  test("sends a feature's geometry in the map projection, without the nulls", async () => {
    const { run, calls } = await setup();
    const { isError } = await run(
      "route",
      routeInput({
        avoid: [area({ feature_id: "adress.1", modes: ["car"] })],
      })
    );
    assert.equal(isError, false);
    assert.deepEqual(calls[0].args.avoid, [
      {
        geojson: point(140000, 6330000),
        srid: 3007,
        modes: ["car"],
        label: "Vägarbete",
      },
    ]);
  });

  test("sends every feature of a search, each named by its title", async () => {
    const { run, calls } = await setup();
    const { result } = await run("search_features", {
      source_id: "adress",
      text: null,
      filters: null,
      near: null,
      sort: null,
      count_only: false,
      offset: 0,
    });
    await run(
      "route",
      routeInput({
        avoid: [area({ result_id: result.resultId, label: "Vägarbeten" })],
      })
    );
    const avoid = calls[0].args.avoid as Array<{ label: string }>;
    assert.equal(avoid.length, 1);
    assert.match(avoid[0].label, /^Vägarbeten: Skolgatan 1/);
  });

  test("uses a drawn area, and a drawn point as a place, without a request", async () => {
    const { run, calls, ctx } = await setup();
    ctx.drawn = new Map([
      ["s1", { id: "s1", title: null, geometry: AREA }],
      ["s2", { id: "s2", title: null, geometry: point(140500, 6330500) }],
    ]);
    const { isError } = await run(
      "route",
      routeInput({
        origin: place({ feature_id: "s2", x: null, y: null }),
        avoid: [area({ feature_id: "s1", buffer_m: 10 })],
      })
    );
    assert.equal(isError, false);
    assert.equal(ctx.wfsRequests, 0);
    assert.deepEqual(calls[0].args.origin, {
      x: 140500,
      y: 6330500,
      srid: 3007,
      label: "Station",
    });
    assert.deepEqual(calls[0].args.avoid, [
      { geojson: AREA, srid: 3007, buffer_m: 10, label: "Vägarbete" },
    ]);
  });

  test("refuses an area given both ways, or neither, without calling the server", async () => {
    const { run, calls } = await setup();
    for (const bad of [
      area(),
      area({ feature_id: "adress.1", result_id: "r1" }),
    ]) {
      assert.equal(
        (await run("route", routeInput({ avoid: [bad] }))).isError,
        true
      );
    }
    assert.equal(calls.length, 0);
  });

  test("refuses an area it can't find, rather than routing through it", async () => {
    const { run, calls } = await setup();
    const { isError, result } = await run(
      "route",
      routeInput({ avoid: [area({ feature_id: "s9" })] })
    );
    assert.equal(isError, true);
    assert.match(result.error, /latest map state/);
    assert.equal(calls.length, 0);
  });

  test("refuses more than the server takes, before any request", async () => {
    const { run, calls, ctx } = await setup();
    const avoid = Array.from({ length: 51 }, () =>
      area({ feature_id: "adress.1" })
    );
    const { isError, result } = await run("route", routeInput({ avoid }));
    assert.equal(isError, true);
    assert.match(result.error, /at most 50/);
    assert.equal(ctx.wfsRequests, 0);
    assert.equal(calls.length, 0);
  });

  test("tells the model how to avoid areas", async () => {
    const { registry } = await setup();
    const route = registry.tools.find((tool) => tool.name === "route")!;
    const item = route.inputSchema.properties!.avoid.items!;
    assert.deepEqual(item.required, [
      "feature_id",
      "result_id",
      "buffer_m",
      "modes",
      "label",
    ]);
  });
});
