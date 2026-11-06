import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildUserCatalog } from "../../server/apis/v2/services/ai/access.service.ts";
import type { UserCatalog } from "../../server/apis/v2/services/ai/access.service.ts";
import {
  buildCatalog,
  walkMapConfig,
} from "../../server/apis/v2/services/ai/catalog.service.ts";
import type { RawMapConfig } from "../../server/apis/v2/services/ai/catalog.service.ts";
import { FeatureResultStore } from "../../server/apis/v2/services/ai/features/featureResults.ts";
import { buildSystemPrompt } from "../../server/apis/v2/services/ai/prompt.ts";
import {
  PAGE_SIZE,
  runTool,
  tools,
  validateInput,
} from "../../server/apis/v2/services/ai/tools.ts";
import type {
  JsonSchema,
  ToolContext,
  ToolEvent,
} from "../../server/apis/v2/services/ai/tools.ts";
import {
  layersStore,
  mapConfig,
  washedMapConfig,
  wmsLayer,
} from "./fixtures.ts";

const view = (config: RawMapConfig = mapConfig(), store = layersStore()) =>
  buildUserCatalog(buildCatalog("demo", config, store), walkMapConfig(config));

const context = (
  userCatalog: UserCatalog = view(),
  overrides: Partial<ToolContext> = {}
): ToolContext => ({
  userCatalog,
  maxLayersOn: 25,
  visibleLayers: new Set(),
  wfs: {
    connectionOf: async () => undefined,
    query: () => Promise.reject(new Error("No source in this test.")),
  },
  featureResults: new FeatureResultStore(),
  signal: new AbortController().signal,
  wfsRequests: 0,
  search: {
    async search(catalog, _query, limit = 10) {
      return {
        mode: "keyword",
        hits: catalog.records
          .slice(0, limit)
          .map((record, i) => ({ record, score: 1 - i / 100 })),
      };
    },
  },
  ...overrides,
});

async function call(
  name: string,
  input: unknown,
  ctx: ToolContext = context()
) {
  const run = await runTool(name, input, ctx);
  return { ...run, result: JSON.parse(run.content) };
}

const noFilters = {
  owner: null,
  role: null,
  group_id: null,
};

const rejectedIds = (result: { rejected: Array<{ id: string }> }) =>
  result.rejected.map((r) => r.id);

// A map with one big folder, for paging and the cap
const bigMap = (count: number) => {
  const config = mapConfig();
  const ids = Array.from({ length: count }, (_, i) => `big${i}`);
  config.tools[0].options!.groups!.push({
    id: "bigGroup",
    name: "Stor",
    layers: ids.map((id) => ({ id })),
    groups: [],
  } as never);
  const store = layersStore();
  store.wmslayers.push(...(ids.map((id) => wmsLayer(id)) as never[]));
  return view(config, store);
};

describe("tool schemas", () => {
  test("meet the strict mode of both providers", () => {
    const check = (schema: JsonSchema, path: string) => {
      const allowed = [
        "type",
        "description",
        "enum",
        "items",
        "properties",
        "required",
        "additionalProperties",
      ];
      for (const key of Object.keys(schema)) {
        assert.ok(allowed.includes(key), `${path} uses ${key}`);
      }
      if (schema.properties !== undefined) {
        assert.equal(schema.additionalProperties, false, path);
        assert.deepEqual(
          [...(schema.required ?? [])].sort(),
          Object.keys(schema.properties).sort(),
          path
        );
        for (const [key, property] of Object.entries(schema.properties)) {
          check(property, `${path}.${key}`);
        }
      }
      if (schema.items !== undefined) check(schema.items, `${path}[]`);
    };
    tools.forEach((tool) => check(tool.inputSchema, tool.name));
  });

  test("stay within Claude's limits for strict schemas", () => {
    const unions = (schema: JsonSchema): number =>
      (Array.isArray(schema.type) ? 1 : 0) +
      Object.values(schema.properties ?? {}).reduce(
        (sum, property) => sum + unions(property),
        0
      ) +
      (schema.items ? unions(schema.items) : 0);

    assert.ok(tools.length <= 20);
    assert.ok(tools.reduce((n, t) => n + unions(t.inputSchema), 0) <= 16);
  });

  test("map actions are never read tools", () => {
    const actions = tools.filter((t) => t.kind === "action").map((t) => t.name);
    assert.deepEqual(actions.sort(), [
      "clear_features",
      "close_plugin",
      "go_to_place",
      "open_plugin",
      "present_layers",
      "set_background",
      "set_layer_visibility",
      "show_features",
    ]);
  });
});

describe("validateInput", () => {
  const schema = tools.find((t) => t.name === "filter_layers")!.inputSchema;
  const valid = { filters: noFilters, count_only: false, offset: 0 };

  test("accepts valid input", () => {
    assert.equal(validateInput(schema, valid), null);
  });

  test("rejects missing, unknown and mistyped properties", () => {
    assert.match(validateInput(schema, { filters: noFilters })!, /missing/);
    assert.match(validateInput(schema, { ...valid, x: 1 })!, /not a known/);
    assert.match(
      validateInput(schema, { ...valid, offset: 1.5 })!,
      /offset must be/
    );
    assert.match(
      validateInput(schema, { ...valid, offset: null })!,
      /offset must be/
    );
    assert.match(
      validateInput(schema, {
        ...valid,
        filters: { ...noFilters, role: "admin" },
      })!,
      /role must be one of/
    );
  });

  test("a failed input never reaches the tool", async () => {
    const { isError, result } = await call("search_layers", { query: 1 });
    assert.equal(isError, true);
    assert.match(result.error, /query/);
  });
});

describe("runTool", () => {
  test("reports an unknown tool", async () => {
    const { isError } = await call("drop_tables", {});
    assert.equal(isError, true);
  });

  test("turns a crash into a result that hides the details", async () => {
    const { isError, result } = await call(
      "search_layers",
      { query: "x", limit: 10 },
      context(view(), {
        search: {
          search: () => Promise.reject(new Error("secret connection string")),
        },
      })
    );
    assert.equal(isError, true);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  });
});

describe("search_layers", () => {
  test("returns compact items and no total", async () => {
    const { result } = await call("search_layers", { query: "x", limit: 2 });
    assert.deepEqual(Object.keys(result), ["layers"]);
    assert.equal(result.layers.length, 2);
    assert.deepEqual(Object.keys(result.layers[0]).sort(), [
      "caption",
      "groupPath",
      "id",
      "role",
    ]);
  });

  test("caps the limit", async () => {
    const { result } = await call(
      "search_layers",
      { query: "x", limit: 500 },
      context(bigMap(40))
    );
    assert.equal(result.layers.length, 25);
  });

  test("rejects a limit below 1", async () => {
    const { isError } = await call("search_layers", { query: "x", limit: 0 });
    assert.equal(isError, true);
  });
});

describe("filter_layers", () => {
  const filter = (
    filters: object,
    ctx?: ToolContext,
    offset = 0,
    countOnly = false
  ) =>
    call(
      "filter_layers",
      {
        filters: { ...noFilters, ...filters },
        count_only: countOnly,
        offset,
      },
      ctx
    );

  test("filters by owner, ignoring case", async () => {
    const { result } = await filter({ owner: "stadsbyggnad" });
    assert.deepEqual(
      result.layers.map((l: { id: string }) => l.id),
      ["plain"]
    );
  });

  test("filters by role", async () => {
    const { result: backgrounds } = await filter({ role: "background" });
    assert.deepEqual(
      backgrounds.layers.map((l: { id: string }) => l.id).sort(),
      ["-1", "-3", "multiBackground"]
    );
  });

  test("a pruned group is unknown", async () => {
    const { isError } = await filter({ group_id: "broken" });
    assert.equal(isError, true);
  });

  test("a group includes its subgroups", async () => {
    const { result } = await filter({ group_id: "top" });
    assert.equal(result.total, 6);
  });

  test("rejects a group the user can't reach", async () => {
    const { isError } = await filter(
      { group_id: "secret" },
      context(view(hideGroup()))
    );
    assert.equal(isError, true);
  });

  test("count_only gives the total alone", async () => {
    const { result } = await filter({ role: "layer" }, undefined, 0, true);
    assert.deepEqual(Object.keys(result), ["total"]);
  });

  test("pages neither repeat nor skip a layer", async () => {
    const ctx = context(bigMap(60));
    const seen: string[] = [];
    let offset = 0;
    let total = 0;
    for (;;) {
      const { result } = await filter({ group_id: "bigGroup" }, ctx, offset);
      total = result.total;
      assert.ok(result.layers.length <= PAGE_SIZE);
      seen.push(...result.layers.map((l: { id: string }) => l.id));
      if (!result.truncated) break;
      offset += PAGE_SIZE;
    }
    assert.equal(total, 60);
    assert.equal(seen.length, 60);
    assert.equal(new Set(seen).size, 60);
  });

  test("marks only unfinished lists as truncated", async () => {
    const ctx = context(bigMap(30));
    const first = await filter({ group_id: "bigGroup" }, ctx, 0);
    const last = await filter({ group_id: "bigGroup" }, ctx, 25);
    assert.equal(first.result.truncated, true);
    assert.equal(last.result.truncated, false);
  });

  test("rejects a negative offset", async () => {
    const { isError } = await filter({}, undefined, -1);
    assert.equal(isError, true);
  });

  test("list items stay compact", async () => {
    const { result } = await filter({ role: "layer" });
    assert.deepEqual(Object.keys(result.layers[0]).sort(), [
      "caption",
      "groupPath",
      "id",
      "role",
    ]);
  });
});

// As washedMapConfig, but without any layer left in the secret group
function hideGroup() {
  const config = washedMapConfig();
  config.tools[0].options!.groups = config.tools[0].options!.groups!.filter(
    (g) => g.id !== "secret"
  );
  return config;
}

describe("get_layer_details", () => {
  test("returns the record, without connection details", async () => {
    const { result, content } = await call("get_layer_details", {
      id: "plain",
    });
    assert.equal(result.owner, "Stadsbyggnad");
    assert.equal(content.includes("secret.example.com"), false);
    assert.equal("url" in result, false);
  });

  test("a restricted layer looks like one that doesn't exist", async () => {
    const ctx = context(view(washedMapConfig()));
    const restricted = await call(
      "get_layer_details",
      { id: "restricted" },
      ctx
    );
    const missing = await call("get_layer_details", { id: "nope" }, ctx);
    assert.equal(restricted.isError, true);
    assert.equal(
      restricted.result.error.replace("restricted", ""),
      missing.result.error.replace("nope", "")
    );
  });
});

describe("no tool leaks connection details", () => {
  test("in any read result", async () => {
    const outputs = await Promise.all([
      call("search_layers", { query: "x", limit: 25 }),
      call("filter_layers", {
        filters: noFilters,
        count_only: false,
        offset: 0,
      }),
      call("get_layer_details", { id: "wfs1" }),
    ]);
    for (const { content } of outputs) {
      assert.equal(content.includes("secret.example"), false);
      assert.equal(content.includes("https://secret"), false);
    }
  });
});

describe("present_layers", () => {
  const present = (ids: string[], ctx?: ToolContext) =>
    call("present_layers", { ids }, ctx);
  const items = (events: ToolEvent[]) =>
    (events[0] as Extract<ToolEvent, { type: "layers" }>).items;

  test("gives each kind of id the right control", async () => {
    const { events, result } = await present([
      "plain",
      "group:sub_a",
      "top",
      "-1",
      "wfs1",
    ]);
    assert.equal(result.shown, 5);
    assert.deepEqual(items(events), [
      {
        id: "plain",
        caption: "Plangräns",
        groupPath: ["Planering"],
        control: "toggle",
      },
      {
        id: "group:sub_a",
        caption: "Sublager A",
        groupPath: ["Planering", "Detaljer", "Layer group"],
        control: "toggle",
      },
      { id: "top", caption: "Planering", groupPath: [], control: "toggle" },
      { id: "-1", caption: "Vit", groupPath: [], control: "background" },
      { id: null, caption: "WFS", groupPath: [], control: "none" },
    ]);
  });

  test("rejects what the user can't reach, and sends no empty event", async () => {
    const { events, result } = await present(
      ["restricted"],
      context(view(washedMapConfig()))
    );
    assert.deepEqual(rejectedIds(result), ["restricted"]);
    assert.deepEqual(events, []);
  });

  test("limits how many are shown", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `big${i}`);
    const { events, result } = await present(ids, context(bigMap(30)));
    assert.equal(items(events).length, 25);
    assert.equal(result.rejected.length, 5);
  });
});

describe("set_layer_visibility", () => {
  const set = (ids: string[], visible: boolean, ctx?: ToolContext) =>
    call("set_layer_visibility", { ids, visible }, ctx);

  test("accepts layers, folders and sublayer addresses", async () => {
    const { result, events } = await set(
      ["plain", "secret", "group:sub_a"],
      true
    );
    assert.deepEqual(result.accepted, ["plain", "secret", "group:sub_a"]);
    assert.deepEqual(result.rejected, []);
    assert.deepEqual(events, [
      {
        type: "action",
        action: "set_layer_visibility",
        ids: ["plain", "secret", "group:sub_a"],
        visible: true,
      },
    ]);
  });

  test("rejects backgrounds and search-only layers, with reasons", async () => {
    const { result, events } = await set(
      ["-1", "multiBackground", "wfs1"],
      false
    );
    assert.deepEqual(rejectedIds(result), ["-1", "multiBackground", "wfs1"]);
    assert.match(result.rejected[0].reason, /set_background/);
    assert.match(result.rejected[2].reason, /Search/);
    assert.deepEqual(events, []);
  });

  test("a layer in Search but not the user's tree can't be toggled", async () => {
    const { result } = await set(
      ["both"],
      true,
      context(view(washedMapConfig()))
    );
    assert.deepEqual(rejectedIds(result), ["both"]);
  });

  test("rejects a pruned folder as unknown", async () => {
    const { result } = await set(["broken"], true);
    assert.deepEqual(rejectedIds(result), ["broken"]);
    assert.equal(result.rejected[0].reason, "Unknown id.");
  });

  test("rejects sublayers of a disallowed parent", async () => {
    const config = hideGroup();
    config.tools[0].options!.groups![0].groups![0].layers =
      config.tools[0].options!.groups![0].groups![0].layers.filter(
        (l) => l.id !== "group"
      );
    const { result } = await set(["group:sub_a"], true, context(view(config)));
    assert.equal(result.rejected[0].reason, "Unknown id.");
  });

  test("rejects sublayers of a hideExpandArrow layer", async () => {
    const { result } = await set(["hiddenSubs:sub_c"], true);
    assert.match(result.rejected[0].reason, /one by one/);
  });

  test("rejects sublayers of a layer that isn't a group layer", async () => {
    const { result } = await set(["plain:plain_name"], true);
    assert.deepEqual(rejectedIds(result), ["plain:plain_name"]);
  });

  test("rejects a sublayer that doesn't exist", async () => {
    const { result } = await set(["group:nope"], true);
    assert.deepEqual(rejectedIds(result), ["group:nope"]);
  });

  describe("cap", () => {
    const capped = (maxLayersOn: number, count = 30) =>
      context(bigMap(count), { maxLayersOn });

    test("counts the leaves of a folder", async () => {
      const { result, events } = await set(["bigGroup"], true, capped(25));
      assert.deepEqual(rejectedIds(result), ["bigGroup"]);
      assert.match(result.rejected[0].reason, /30 layers/);
      assert.deepEqual(events, []);
    });

    test("doesn't apply when turning off", async () => {
      const { result } = await set(["bigGroup"], false, capped(2));
      assert.deepEqual(result.accepted, ["bigGroup"]);
    });

    test("is reached by several ids together", async () => {
      const { result } = await set(["big0", "big1", "big2"], true, capped(2));
      assert.deepEqual(result.accepted, ["big0", "big1"]);
      assert.deepEqual(rejectedIds(result), ["big2"]);
    });

    test("counts a layer in a folder only once", async () => {
      const { result } = await set(["secret", "plain", "both"], true, {
        ...context(),
        maxLayersOn: 4,
      });
      assert.deepEqual(result.accepted, ["secret", "plain", "both"]);
    });

    test("counts an exclusive folder and a sublayer as one each", async () => {
      const { result } = await set(["nested", "plain"], true, {
        ...context(),
        maxLayersOn: 2,
      });
      assert.deepEqual(result.accepted, ["nested", "plain"]);
    });

    test("lets a later small id through after a big one", async () => {
      const { result } = await set(["bigGroup", "plain"], true, capped(25));
      assert.deepEqual(result.accepted, ["plain"]);
    });
  });

  describe("exclusive groups", () => {
    test("keeps only the last of several siblings", async () => {
      const { result, events } = await set(["sameCaption", "group"], true);
      assert.deepEqual(result.accepted, ["group"]);
      assert.deepEqual(rejectedIds(result), ["sameCaption"]);
      assert.match(result.rejected[0].reason, /exclusive group "Detaljer"/);
      assert.deepEqual((events[0] as { ids: string[] }).ids, ["group"]);
    });

    test("reports visible siblings that get hidden", async () => {
      const ctx = context(view(), { visibleLayers: new Set(["hiddenSubs"]) });
      const { result } = await set(["group"], true, ctx);
      assert.deepEqual(result.hiddenSiblings, [
        { id: "hiddenSubs", caption: "Layer hiddenSubs", group: "Detaljer" },
      ]);
      assert.deepEqual([...ctx.visibleLayers], ["group"]);
    });

    test("reports nothing as hidden when the cap rejects the winner", async () => {
      const ctx = context(view(), {
        maxLayersOn: 1,
        visibleLayers: new Set(["hiddenSubs"]),
      });
      const { result } = await set(["plain", "group"], true, ctx);
      assert.deepEqual(result.accepted, ["plain"]);
      assert.deepEqual(result.hiddenSiblings, []);
      assert.equal(ctx.visibleLayers.has("hiddenSubs"), true);
    });

    test("a sublayer counts as its parent", async () => {
      const ctx = context(view(), { visibleLayers: new Set(["sameCaption"]) });
      const { result } = await set(["group:sub_a"], true, ctx);
      assert.deepEqual(
        result.hiddenSiblings.map((s: { id: string }) => s.id),
        ["sameCaption"]
      );
    });

    test("two sublayers of one parent aren't siblings", async () => {
      const { result } = await set(["group:sub_a", "group:sub_b"], true);
      assert.deepEqual(result.accepted, ["group:sub_a", "group:sub_b"]);
    });

    test("a folder says which layer it shows", async () => {
      const { result } = await set(["nested"], true);
      assert.deepEqual(result.shownInExclusiveFolders, [
        { folderId: "nested", shownLayerId: "sameCaption" },
      ]);
    });

    test("a later call in the turn sees the earlier one", async () => {
      const ctx = context();
      await set(["sameCaption"], true, ctx);
      const { result } = await set(["group"], true, ctx);
      assert.deepEqual(
        result.hiddenSiblings.map((s: { id: string }) => s.id),
        ["sameCaption"]
      );
    });

    test("turning off doesn't touch siblings", async () => {
      const ctx = context(view(), {
        visibleLayers: new Set(["group", "sameCaption"]),
      });
      const { result } = await set(["group"], false, ctx);
      assert.deepEqual(result.accepted, ["group"]);
      assert.deepEqual([...ctx.visibleLayers], ["sameCaption"]);
    });

    test("rejects an exclusive folder with no layers of its own", async () => {
      const config = mapConfig();
      const nested = config.tools[0].options!.groups![0].groups![0];
      (nested as { groups: unknown[] }).groups = [
        { id: "leaf", name: "Under", layers: nested.layers, groups: [] },
      ];
      nested.layers = [];
      const { result } = await set(["nested"], true, context(view(config)));
      assert.match(result.rejected[0].reason, /subgroups/);
    });
  });
});

describe("set_background", () => {
  test("accepts configured and built-in backgrounds", async () => {
    for (const id of ["multiBackground", "-1"]) {
      const { events, result } = await call("set_background", { id });
      assert.deepEqual(result.accepted, [id]);
      assert.deepEqual(events, [
        { type: "action", action: "set_background", id },
      ]);
    }
  });

  test("rejects anything else, and sends no action", async () => {
    for (const id of ["plain", "wfs1", "nope", "-2"]) {
      const { events, result } = await call("set_background", { id });
      assert.deepEqual(rejectedIds(result), [id]);
      assert.deepEqual(events, []);
    }
  });
});

describe("open_plugin", () => {
  test("accepts a plugin on the map, and sends it in lowercase", async () => {
    for (const plugin of ["sketch", "Sketch"]) {
      const { events, result } = await call("open_plugin", { plugin });
      assert.deepEqual(result, { accepted: ["sketch"], rejected: [] });
      assert.deepEqual(events, [
        { type: "action", action: "open_plugin", plugin: "sketch" },
      ]);
    }
  });

  test("rejects what wouldn't open, and sends no action", async () => {
    // A tool with nothing to show, the chat itself, a hidden one, and one that
    // is only a control button
    for (const plugin of ["search", "aichat", "measurer", "location"]) {
      const { events, result } = await call("open_plugin", { plugin });
      assert.deepEqual(result.accepted, []);
      assert.deepEqual(rejectedIds(result), [plugin]);
      assert.deepEqual(events, []);
    }
  });

  test("answers the same for a restricted plugin as for an unknown one", async () => {
    const config = mapConfig();
    config.tools = config.tools.filter((t) => t.type !== "fir");
    const ctx = context(view(config));

    const restricted = await call("open_plugin", { plugin: "fir" }, ctx);
    const unknown = await call("open_plugin", { plugin: "nope" }, ctx);

    assert.deepEqual(restricted.events, []);
    assert.equal(
      restricted.result.rejected[0].reason,
      unknown.result.rejected[0].reason
    );
  });

  test("doesn't take names from the prototype of the allowlist", async () => {
    const config = mapConfig();
    config.tools.push({ type: "constructor", options: { target: "toolbar" } });
    const { events } = await call(
      "open_plugin",
      { plugin: "constructor" },
      context(view(config))
    );
    assert.deepEqual(events, []);
  });
});

describe("close_plugin", () => {
  test("accepts a plugin on the map", async () => {
    const { events, result } = await call("close_plugin", { plugin: "Sketch" });
    assert.deepEqual(result, { accepted: ["sketch"], rejected: [] });
    assert.deepEqual(events, [
      { type: "action", action: "close_plugin", plugin: "sketch" },
    ]);
  });

  test("can't close the chat itself", async () => {
    const { events, result } = await call("close_plugin", { plugin: "aichat" });
    assert.deepEqual(rejectedIds(result), ["aichat"]);
    assert.deepEqual(events, []);
  });

  test("answers the same for a restricted plugin as for an unknown one", async () => {
    const config = mapConfig();
    config.tools = config.tools.filter((t) => t.type !== "fir");
    const ctx = context(view(config));

    const restricted = await call("close_plugin", { plugin: "fir" }, ctx);
    const unknown = await call("close_plugin", { plugin: "nope" }, ctx);

    assert.deepEqual(restricted.events, []);
    assert.equal(
      restricted.result.rejected[0].reason,
      unknown.result.rejected[0].reason
    );
  });
});

describe("places", () => {
  const filter = (filters: object) =>
    call("filter_layers", {
      filters: { ...noFilters, ...filters },
      count_only: false,
      offset: 0,
    });

  const withoutPreset = () => {
    const config = mapConfig();
    config.tools = config.tools.filter((t) => t.type !== "preset");
    return context(view(config));
  };

  test("filter_layers leaves them out unless asked for", async () => {
    const { result } = await filter({});
    assert.equal(
      result.layers.some((l: { role: string }) => l.role === "place"),
      false
    );
  });

  test("filter_layers lists them by role", async () => {
    const { result } = await filter({ role: "place" });
    assert.deepEqual(
      result.layers.map((l: { caption: string }) => l.caption),
      ["Bryggan", "Torget"]
    );
  });

  test("set_layer_visibility rejects a place", async () => {
    const { events, result } = await call("set_layer_visibility", {
      ids: ["place:Bryggan"],
      visible: true,
    });
    assert.deepEqual(events, []);
    assert.match(result.rejected[0].reason, /go_to_place/);
  });

  test("present_layers gives them a control of their own", async () => {
    const { events } = await call("present_layers", {
      ids: ["place:Bryggan"],
    });
    assert.deepEqual(events, [
      {
        type: "layers",
        items: [
          {
            id: "place:Bryggan",
            caption: "Bryggan",
            groupPath: [],
            control: "place",
          },
        ],
      },
    ]);
  });

  test("go_to_place sends the name of the place", async () => {
    const { events, result } = await call("go_to_place", {
      id: "place:Bryggan",
    });
    assert.deepEqual(events, [
      { type: "action", action: "go_to_place", place: "Bryggan" },
    ]);
    assert.deepEqual(result, {
      accepted: ["place:Bryggan"],
      rejected: [],
      needsConfirmation: false,
    });
  });

  test("go_to_place says when the user has to confirm", async () => {
    const { result } = await call("go_to_place", { id: "place:Torget" });
    assert.equal(result.needsConfirmation, true);
  });

  test("go_to_place rejects a layer and an unknown id alike", async () => {
    const layer = await call("go_to_place", { id: "plain" });
    const unknown = await call("go_to_place", { id: "place:Nope" });
    assert.deepEqual(layer.events, []);
    assert.deepEqual(unknown.events, []);
    assert.equal(
      layer.result.rejected[0].reason,
      unknown.result.rejected[0].reason
    );
  });

  test("a user without the preset tool can't go to a place", async () => {
    const { events, result } = await call(
      "go_to_place",
      { id: "place:Bryggan" },
      withoutPreset()
    );
    assert.deepEqual(events, []);
    assert.deepEqual(result.accepted, []);
  });

  test("no result holds the link of a place", async () => {
    const outputs = await Promise.all([
      call("filter_layers", {
        filters: { ...noFilters, role: "place" },
        count_only: false,
        offset: 0,
      }),
      call("get_layer_details", { id: "place:Bryggan" }),
      call("go_to_place", { id: "place:Bryggan" }),
    ]);
    for (const { content } of outputs) {
      assert.equal(content.includes("presetUrl"), false);
      assert.equal(content.includes("100.5"), false);
    }
  });
});

describe("buildSystemPrompt", () => {
  test("lists the plugins that can be opened, and only those", () => {
    const prompt = buildSystemPrompt(view());
    assert.ok(prompt.includes("- Rita [sketch]"));
    assert.ok(prompt.includes("- Skriv ut kartan [print]"));
    assert.equal(prompt.includes("[measurer]"), false);
    assert.equal(prompt.includes("[location]"), false);
    assert.equal(prompt.includes("[aichat]"), false);
  });

  test("leaves out a plugin the user has no access to", () => {
    const config = mapConfig();
    config.tools = config.tools.filter((t) => t.type !== "fir");
    assert.equal(buildSystemPrompt(view(config)).includes("[fir]"), false);
  });

  test("gives the title and projection", () => {
    const prompt = buildSystemPrompt(
      view({ ...mapConfig(), map: { title: "Demo", projection: "EPSG:3007" } })
    );
    assert.ok(prompt.includes('The map is called "Demo".'));
    assert.ok(prompt.includes("Its projection is EPSG:3007."));
  });

  test("names the tools that can't be opened", () => {
    const prompt = buildSystemPrompt(view());
    assert.match(prompt, /can't be opened or closed: .*Mät/);
  });

  test("never includes other tool options", () => {
    const prompt = buildSystemPrompt(view());
    assert.equal(prompt.includes("do not expose"), false);
    assert.equal(prompt.includes("secretSetting"), false);
  });

  test("says so when nothing can be opened", () => {
    const config = mapConfig();
    config.tools = config.tools.filter((t) => t.type === "layerswitcher");
    assert.ok(
      buildSystemPrompt(view(config)).includes("No tools can be opened")
    );
  });
});
