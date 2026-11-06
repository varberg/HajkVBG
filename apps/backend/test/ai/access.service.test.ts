import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  AccessService,
  buildUserCatalog,
  isSubLayerAddressAllowed,
  parseSubLayerAddress,
  renderGroupTree,
} from "../../server/apis/v2/services/ai/access.service.ts";
import {
  buildCatalog,
  walkMapConfig,
} from "../../server/apis/v2/services/ai/catalog.service.ts";
import type {
  Catalog,
  ConfigSource,
  RawMapConfig,
} from "../../server/apis/v2/services/ai/catalog.service.ts";
import { AccessError } from "../../server/apis/v2/utils/AccessError.js";
import {
  featureMapConfig,
  featureStore,
  layersStore,
  mapConfig,
  washedFeatureMapConfig,
  washedMapConfig,
} from "./fixtures.ts";

// Run with: npm test (loads .env.example, so the logger has what it needs)

const rawCatalog = () => buildCatalog("demo", mapConfig(), layersStore());
const fullView = () =>
  buildUserCatalog(rawCatalog(), walkMapConfig(mapConfig()));
const washedView = () =>
  buildUserCatalog(rawCatalog(), walkMapConfig(washedMapConfig()));

describe("buildUserCatalog", () => {
  test("keeps separate sets per role", () => {
    const { allowed } = fullView();
    assert.equal(allowed.layers.has("plain"), true);
    assert.equal(allowed.backgrounds.has("multiBackground"), true);
    assert.equal(allowed.backgrounds.has("-1"), true);
    assert.equal(allowed.search.has("wfs1"), true);
    assert.equal(allowed.layers.has("wfs1"), false);
    assert.equal(allowed.layers.has("multiBackground"), false);
  });

  test("leaves out layers the user can't reach", () => {
    const view = washedView();
    assert.equal(view.allowed.layers.has("restricted"), false);
    assert.equal(view.recordsById.has("restricted"), false);
    assert.equal(
      view.records.some((r) => r.id === "restricted"),
      false
    );
  });

  test("a layer in Search but not the tree gets no toggle", () => {
    const view = washedView();
    assert.equal(view.allowed.layers.has("both"), false);
    assert.equal(view.allowed.search.has("both"), true);
    assert.equal(view.recordsById.get("both")!.role, "search");
  });

  test("that layer doesn't reveal the group it was removed from", () => {
    const record = washedView().recordsById.get("both")!;
    assert.deepEqual(record.groupPath, []);
    assert.equal(record.groupId, null);
    assert.equal(record.text, "Egen text");
    assert.equal(JSON.stringify(record).includes("Hemlig"), false);
  });

  test("the same layer keeps its place for a user who has it in the tree", () => {
    const record = fullView().recordsById.get("both")!;
    assert.equal(record.role, "layer");
    assert.deepEqual(record.groupPath, ["Hemlig grupp"]);
    assert.equal(record.text, "Egen text\n\nHemlig gruppinfo");
  });

  test("searchable follows the user's own Search, not the raw catalog", () => {
    const config = mapConfig();
    config.tools[1].options!.layers = [];
    const view = buildUserCatalog(rawCatalog(), walkMapConfig(config));
    assert.equal(view.recordsById.get("both")!.searchable, false);
    assert.equal(rawCatalog().recordsById.get("both")!.searchable, true);
  });

  test("a sublayer of a Search-only layer can't be toggled", () => {
    const config = mapConfig();
    const groups = config.tools[0].options!.groups!;
    groups[0].groups![0].layers = [];
    config.tools[1].options!.layers!.push({ id: "group" });
    const record = buildUserCatalog(
      rawCatalog(),
      walkMapConfig(config)
    ).recordsById.get("group")!;
    assert.equal(record.role, "search");
    assert.equal(record.isGroupLayer, false);
    assert.equal(record.subLayersToggleable, false);
  });

  test("ignores ids missing from the catalog", () => {
    const { allowed } = fullView();
    assert.equal(allowed.layers.has("dangling"), false);
  });

  test("prunes groups with no allowed layers, and keeps the rest", () => {
    const { allowed, groups, groupsById } = washedView();
    assert.equal(allowed.groups.has("secret"), false);
    assert.equal(groupsById.has("secret"), false);
    assert.equal(allowed.groups.has("broken"), false);
    assert.deepEqual(
      groups.map((g) => g.id),
      ["top", "nested"]
    );
  });

  test("a parent stays when only a nested group has layers", () => {
    const config = mapConfig();
    config.tools[0].options!.groups![0].layers = [];
    const view = buildUserCatalog(rawCatalog(), walkMapConfig(config));
    assert.equal(view.allowed.groups.has("top"), true);
    assert.equal(view.groupsById.get("top")!.leafLayerIds.length, 3);
  });

  test("group leaves only hold allowed layers", () => {
    const config = mapConfig();
    config.tools[0].options!.groups![0].layers = [{ id: "plain" }];
    const view = buildUserCatalog(rawCatalog(), walkMapConfig(config));
    const top = view.groupsById.get("top")!;
    assert.equal(top.leafLayerIds.includes("wmts1"), false);
    assert.equal(top.leafLayerIds.includes("plain"), true);
  });

  test("doesn't change the shared raw catalog", () => {
    const catalog = rawCatalog();
    const before = JSON.stringify(catalog.records);
    buildUserCatalog(catalog, walkMapConfig(washedMapConfig()));
    assert.equal(JSON.stringify(catalog.records), before);
    const secret = catalog.groups.find((g) => g.id === "secret")!;
    assert.equal(secret.leafLayerIds.length, 3);
  });
});

describe("places", () => {
  const withoutPreset = () => {
    const config = mapConfig();
    config.tools = config.tools.filter((t) => t.type !== "preset");
    return buildUserCatalog(rawCatalog(), walkMapConfig(config));
  };

  test("are reachable with the preset tool", () => {
    const { allowed, recordsById } = fullView();
    assert.deepEqual([...allowed.places], ["place:Bryggan", "place:Torget"]);
    assert.equal(recordsById.get("place:Bryggan")?.role, "place");
  });

  test("are gone for a user without the preset tool", () => {
    const { allowed, records } = withoutPreset();
    assert.equal(allowed.places.size, 0);
    assert.equal(
      records.some((r) => r.role === "place"),
      false
    );
  });
});

describe("group tree", () => {
  test("nests groups and counts allowed leaves", () => {
    const [top] = washedView().groupTree;
    assert.equal(top.name, "Planering");
    assert.equal(top.leafCount, 6);
    assert.equal(top.children[0].id, "nested");
    assert.equal(top.children[0].exclusive, true);
    assert.equal(top.children[0].leafCount, 3);
  });

  test("renders to compact text, without pruned groups", () => {
    assert.equal(
      renderGroupTree(washedView().groupTree),
      "- Planering [top] (6)\n  - Detaljer [nested] (3) exclusive"
    );
  });
});

describe("sublayer addresses", () => {
  test("parses at the first colon, as the client does", () => {
    assert.deepEqual(parseSubLayerAddress(fullView(), "group:ws:sub"), {
      layerId: "group",
      subLayerId: "ws:sub",
    });
  });

  test("rejects malformed addresses", () => {
    for (const address of ["group", ":sub", "group:"]) {
      assert.equal(parseSubLayerAddress(fullView(), address), null);
    }
  });

  test("a real layer id with a colon is not an address", () => {
    const catalog: Catalog = buildCatalog(
      "demo",
      {
        tools: [
          {
            type: "layerswitcher",
            options: { groups: [{ id: "g", layers: [{ id: "a:b" }] }] },
          },
        ],
      },
      { wmslayers: [{ id: "a:b", caption: "Colon" }] }
    );
    const view = buildUserCatalog(
      catalog,
      walkMapConfig({
        tools: [
          {
            type: "layerswitcher",
            options: { groups: [{ id: "g", layers: [{ id: "a:b" }] }] },
          },
        ],
      })
    );
    assert.equal(parseSubLayerAddress(view, "a:b"), null);
  });

  test("allows a known sublayer of an allowed group layer", () => {
    assert.equal(isSubLayerAddressAllowed(fullView(), "group:sub_a"), true);
  });

  test("rejects an unknown sublayer", () => {
    assert.equal(isSubLayerAddressAllowed(fullView(), "group:nope"), false);
  });

  test("rejects sublayers of a layer that isn't a group layer", () => {
    assert.equal(
      isSubLayerAddressAllowed(fullView(), "plain:plain_name"),
      false
    );
  });

  test("rejects sublayers of a hideExpandArrow layer", () => {
    assert.equal(
      isSubLayerAddressAllowed(fullView(), "hiddenSubs:sub_c"),
      false
    );
  });

  test("rejects sublayers of a disallowed parent", () => {
    const config = mapConfig();
    config.tools[0].options!.groups![0].groups![0].layers = [];
    const view = buildUserCatalog(rawCatalog(), walkMapConfig(config));
    assert.equal(isSubLayerAddressAllowed(view, "group:sub_a"), false);
  });

  test("rejects sublayers of a background", () => {
    assert.equal(
      isSubLayerAddressAllowed(fullView(), "multiBackground:bg_a"),
      false
    );
  });
});

describe("AccessService", () => {
  const setup = (washed: (user?: string) => RawMapConfig = mapConfig) => {
    const state = { calls: 0, time: 0, catalog: rawCatalog() };
    const config = {
      getMapConfig: async (_map: string, user?: string) => {
        state.calls += 1;
        return washed(user);
      },
    } as ConfigSource;
    const service = new AccessService({
      config,
      catalogs: { getCatalog: async () => state.catalog },
      now: () => state.time,
    });
    return { service, state };
  };

  test("washes with the user's own name", async () => {
    const seen: Array<string | undefined> = [];
    const { service } = setup((user) => {
      seen.push(user);
      return mapConfig();
    });
    await service.getUserCatalog("demo", "anna");
    assert.deepEqual(seen, ["anna"]);
  });

  test("denies access when the config service returns an error", async () => {
    const error = new AccessError("No access to map");
    const { service } = setup(() => ({ error }));
    await assert.rejects(service.getUserCatalog("demo", "anna"), {
      statusCode: 403,
      message: "No access to map",
    });
  });

  test("denies access on any other config error too", async () => {
    const { service } = setup(() => ({ error: new Error("AD unreachable") }));
    await assert.rejects(service.getUserCatalog("demo"), /AD unreachable/);
  });

  test("doesn't cache a denial", async () => {
    let denied = true;
    const { service } = setup(() =>
      denied ? { error: new AccessError("No") } : mapConfig()
    );
    await assert.rejects(service.getUserCatalog("demo", "anna"));
    denied = false;
    assert.equal((await service.getUserCatalog("demo", "anna")).map, "demo");
  });

  test("responds 403 when the aichat tool is missing", async () => {
    const withoutTool = () => {
      const config = mapConfig();
      config.tools = config.tools.filter((t) => t.type !== "aichat");
      return config;
    };
    const { service } = setup(withoutTool);
    await assert.rejects(service.getUserCatalog("demo"), { statusCode: 403 });
  });

  test("responds 403 for a config without tools", async () => {
    const { service } = setup(() => ({}));
    await assert.rejects(service.getUserCatalog("demo"), { statusCode: 403 });
  });

  test("validates the map name", async () => {
    const { service, state } = setup();
    await assert.rejects(service.getUserCatalog("../secret"), {
      statusCode: 400,
    });
    assert.equal(state.calls, 0);
  });

  test("anonymous visitors share one entry per map", async () => {
    const { service, state } = setup();
    const first = await service.getUserCatalog("demo");
    const second = await service.getUserCatalog("demo", undefined);
    assert.equal(first, second);
    assert.equal(state.calls, 1);
  });

  test("users get separate entries", async () => {
    const { service, state } = setup((user) =>
      user === "anna" ? mapConfig() : washedMapConfig()
    );
    const anna = await service.getUserCatalog("demo", "anna");
    const berit = await service.getUserCatalog("demo", "berit");
    assert.equal(anna.allowed.layers.has("restricted"), true);
    assert.equal(berit.allowed.layers.has("restricted"), false);
    assert.equal(state.calls, 2);
  });

  test("a user named anonymous isn't mixed up with no user", async () => {
    const { service } = setup((user) =>
      user === undefined ? washedMapConfig() : mapConfig()
    );
    await service.getUserCatalog("demo");
    const named = await service.getUserCatalog("demo", "anonymous");
    assert.equal(named.allowed.layers.has("restricted"), true);
  });

  test("entries expire", async () => {
    const { service, state } = setup();
    await service.getUserCatalog("demo");
    state.time += 59_000;
    await service.getUserCatalog("demo");
    assert.equal(state.calls, 1);
    state.time += 2_000;
    await service.getUserCatalog("demo");
    assert.equal(state.calls, 2);
  });

  test("a file change clears entries, through the new catalog", async () => {
    const { service, state } = setup();
    await service.getUserCatalog("demo");
    state.catalog = rawCatalog();
    await service.getUserCatalog("demo");
    assert.equal(state.calls, 2);
  });

  test("the cache has an upper limit, removing the oldest first", async () => {
    const { service, state } = setup();
    for (let i = 0; i < 201; i += 1) {
      await service.getUserCatalog("demo", `user${i}`);
    }
    assert.equal(state.calls, 201);
    await service.getUserCatalog("demo", "user200");
    assert.equal(state.calls, 201);
    await service.getUserCatalog("demo", "user0");
    assert.equal(state.calls, 202);
  });
});

describe("feature sources", () => {
  const view = (config: RawMapConfig = featureMapConfig()) =>
    buildUserCatalog(
      buildCatalog("demo", featureMapConfig(), featureStore()),
      walkMapConfig(config)
    );
  const source = (id: string, config?: RawMapConfig) =>
    view(config).featureSources.find((s) => s.id === id);

  test("needs a source to be listed, in Search and a WFS layer", () => {
    assert.deepEqual(
      view().featureSources.map((s) => s.id),
      ["adress", "sjo", "begransad"]
    );
  });

  test("gives the caption and the description", () => {
    const { caption, description } = source("adress")!;
    assert.equal(caption, "Källa adress");
    assert.equal(description, "Alla adresser i kommunen");
  });

  test("allows the fields users see, without labels and geometry", () => {
    assert.deepEqual(source("adress")!.fields, [
      "sok",
      "postort",
      "gata",
      "adat",
      "kod",
    ]);
  });

  test("adds the extra fields of a source", () => {
    assert.deepEqual(source("sjo")!.fields, ["namn", "maxdjup"]);
  });

  test("leaves out a source the user can't reach in Search", () => {
    assert.equal(source("begransad", washedFeatureMapConfig()), undefined);
  });

  test("leaves out a source the washed config doesn't list", () => {
    const config = featureMapConfig();
    const tools = config.tools.filter((tool) => tool.type !== "aichat");
    assert.deepEqual(view({ ...config, tools }).featureSources, []);
  });

  test("never holds a URL", () => {
    const { featureSources, records, mapInfo } = view();
    const json = JSON.stringify({ featureSources, records, mapInfo });
    assert.equal(json.includes("secret.example.com"), false);
  });
});
